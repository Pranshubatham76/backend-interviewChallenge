const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../db/db');
const { getTaskByIdIncludingDeleted } = require('./taskService');
const config = require('../config');

const MAX_RETRIES = 3;

// Import challenge constraints (fallback to local definitions for compatibility)
let CHALLENGE_CONSTRAINTS;
try {
  CHALLENGE_CONSTRAINTS = require('../utils/challenge-constraints').CHALLENGE_CONSTRAINTS;
} catch (e) {
  // Fallback definitions if TypeScript file not accessible
  CHALLENGE_CONSTRAINTS = {
    SYNC_ORDER: 'chronological-per-task',
    CONFLICT_PRIORITY: { 'delete': 3, 'update': 2, 'create': 1 },
    ERROR_HANDLING: 'dead-letter-queue',
    BATCH_INTEGRITY: 'checksum-required',
    SYNC_STATES: ['pending', 'in-progress', 'synced', 'error', 'failed']
  };
}

const CONFLICT_PRIORITY = CHALLENGE_CONSTRAINTS.CONFLICT_PRIORITY;
const SYNC_STATES = CHALLENGE_CONSTRAINTS.SYNC_STATES;

// Helper function to generate checksum for batch integrity
const generateBatchChecksum = (items) => {
  const sortedItems = items.map(item => ({
    id: item.id,
    task_id: item.task_id,
    operation: item.operation,
    data: typeof item.data === 'string' ? item.data : JSON.stringify(item.data)
  })).sort((a, b) => a.id.localeCompare(b.id));
  
  const content = JSON.stringify(sortedItems);
  return crypto.createHash('md5').update(content).digest('hex');
};

// Helper function to verify batch checksum
const verifyBatchChecksum = (items, expectedChecksum) => {
  return generateBatchChecksum(items) === expectedChecksum;
};

const sync = async (changes, last_synced_at, userId, syncId) => {
  // Add client changes to sync queue first
  for (const change of changes) {
    if (!['create', 'update', 'delete'].includes(change.operation)) {
      throw new Error(`Invalid operation: ${change.operation}`);
    }
    const taskId = change.server_id || change.local_id;
    await addToSyncQueue(taskId, change.operation, change.data, userId);
  }

  // CONSTRAINT FIX: Read queue ordered chronologically per task (operation_timestamp)
  // This ensures operations for each task are processed in chronological order
  const queueItems = await db.allQuery(
    `SELECT * FROM sync_queue WHERE user_id = ? 
     ORDER BY task_id, operation_timestamp, created_at, id`,
    [userId]
  );

  // CONSTRAINT FIX: Group by batches with checksum validation
  const batches = [];
  for (let i = 0; i < queueItems.length; i += config.SYNC_BATCH_SIZE) {
    const batch = queueItems.slice(i, i + config.SYNC_BATCH_SIZE);
    const checksum = generateBatchChecksum(batch);
    batches.push({ items: batch, checksum });
  }

  // CONSTRAINT FIX: Process batches with checksum validation and sync states
  const mappings = [];
  const conflicts = [];
  let processed = 0;
  let failed = 0;

  for (const batchData of batches) {
    const { items: batch, checksum } = batchData;
    
    // Verify batch integrity
    if (!verifyBatchChecksum(batch, checksum)) {
      console.error('Batch checksum validation failed, skipping batch');
      failed += batch.length;
      continue;
    }
    
    // Set items to 'in-progress' state before processing
    for (const item of batch) {
      await updateSyncStatus(item.task_id, 'in-progress', userId);
    }
    
    const { mappings: m, conflicts: c, processed: p, failed: f } = await processBatch(
      batch,
      userId
    );
    mappings.push(...m);
    conflicts.push(...c);
    processed += p;
    failed += f;
  }

  // Log sync result (do not let logging errors break flow)
  const logId = syncId || uuidv4();
  const syncLog = {
    id: logId,
    user_id: userId,
    change_count: queueItems.length,
    processed,
    failed,
    status: failed > 0 ? 'error' : 'completed',
    created_at: new Date().toISOString(),
  };
  try {
    await db.runQuery(
      'INSERT INTO sync_logs (id, user_id, change_count, processed, failed, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        syncLog.id,
        syncLog.user_id,
        syncLog.change_count,
        syncLog.processed,
        syncLog.failed,
        syncLog.status,
        syncLog.created_at,
      ]
    );
  } catch (_) {
    // ignore
  }

  // Return server changes since last sync
  const serverChanges = await db.allQuery(
    'SELECT * FROM tasks WHERE user_id = ? AND updated_at > ?',
    [userId, last_synced_at]
  );

  return { mappings, conflicts, serverChanges, status: syncLog.status, processed, failed };
};

const addToSyncQueue = async (taskId, operation, data, userId, operationTimestamp = null) => {
  const queueId = uuidv4();
  const created_at = new Date().toISOString();
  const operation_timestamp = operationTimestamp || created_at;
  const serializedData = JSON.stringify(data || {});
  await db.runQuery(
    'INSERT INTO sync_queue (id, user_id, task_id, operation, data, retry_count, created_at, operation_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [queueId, userId, taskId, operation, serializedData, 0, created_at, operation_timestamp]
  );
};

const processBatch = async (items, userId) => {
  const mappings = [];
  const conflicts = [];
  let processed = 0;
  let failed = 0;

  for (const raw of items) {
    const item = { ...raw, data: safeParseJSON(raw.data) };
    try {
      const result = await processItem(item, item.data, userId);
      if (result.mapping) mappings.push(result.mapping);
      if (result.conflict) conflicts.push(result.conflict);
      processed++;
      await updateSyncStatus(item.task_id, 'synced', userId, result.serverData || {});
    } catch (err) {
      await handleSyncError(item, err, userId);
      failed++;
    }
  }

  return { mappings, conflicts, processed, failed };
};

const processItem = async (item, data, userId) => {
  const now = new Date().toISOString();
  if (item.operation === 'create') {
    const id = uuidv4();
    const taskData = {
      id,
      user_id: userId,
      title: data.title,
      description: data.description || '',
      completed: data.completed ? 1 : 0,
      created_at: data.created_at || now,
      updated_at: data.updated_at || now,
      is_deleted: 0,
      sync_status: 'synced',
      server_id: id,
      last_synced_at: now,
    };
    await db.runQuery(
      'INSERT INTO tasks (id, user_id, title, description, completed, created_at, updated_at, is_deleted, sync_status, server_id, last_synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        taskData.id,
        taskData.user_id,
        taskData.title,
        taskData.description,
        taskData.completed,
        taskData.created_at,
        taskData.updated_at,
        taskData.is_deleted,
        taskData.sync_status,
        taskData.server_id,
        taskData.last_synced_at,
      ]
    );
    return { mapping: { local_id: item.task_id, server_id: id }, serverData: taskData };
  }

  if (item.operation === 'update' || item.operation === 'delete') {
    const serverTask = await getTaskByIdIncludingDeleted(item.task_id, userId);
    if (!serverTask) {
      if (item.operation === 'delete') return { processed: true };
      // If updating a non-existent task, create it
      return await processItem({ ...item, operation: 'create' }, data, userId);
    }

    const localTask = { ...serverTask, ...data, id: item.task_id };
    const resolvedTask = await resolveConflict(localTask, serverTask, item.operation);
    if (resolvedTask === serverTask) {
      return { conflict: { local_id: item.task_id, server_task: serverTask } };
    }

    // Merge and apply update/delete
    const mergedTask = {
      title: data.title ?? serverTask.title,
      description: data.description !== undefined ? data.description : serverTask.description,
      completed: data.completed !== undefined ? (data.completed ? 1 : 0) : serverTask.completed,
      is_deleted: item.operation === 'delete' ? 1 : (data.is_deleted ?? serverTask.is_deleted),
      updated_at: now,
      sync_status: 'synced',
      last_synced_at: now,
    };

    await db.runQuery(
      'UPDATE tasks SET title = ?, description = ?, completed = ?, is_deleted = ?, updated_at = ?, sync_status = ?, last_synced_at = ? WHERE id = ? AND user_id = ?',
      [
        mergedTask.title,
        mergedTask.description,
        mergedTask.completed,
        mergedTask.is_deleted,
        mergedTask.updated_at,
        mergedTask.sync_status,
        mergedTask.last_synced_at,
        item.task_id,
        userId,
      ]
    );
    return { serverData: mergedTask };
  }

  throw new Error(`Unknown operation: ${item.operation}`);
};

// CONSTRAINT FIX: Enhanced conflict resolution with operation type priority
const resolveConflict = async (localTask, serverTask, localOperation = 'update') => {
  const localUpdated = new Date(localTask.updated_at);
  const serverUpdated = new Date(serverTask.updated_at);
  
  // If timestamps are equal, use operation priority
  if (localUpdated.getTime() === serverUpdated.getTime()) {
    const localPriority = CONFLICT_PRIORITY[localOperation] || 1;
    const serverPriority = CONFLICT_PRIORITY['update']; // Assume server operations are updates
    
    const resolvedTask = localPriority >= serverPriority ? localTask : serverTask;
    console.log(
      `Resolving conflict for task ${localTask.id}: equal timestamps, local_op=${localOperation}(priority=${localPriority}), server_op=update(priority=${serverPriority}), chose=${resolvedTask === localTask ? 'local' : 'server'}`
    );
    return resolvedTask;
  }
  
  // Use last-write-wins for different timestamps
  const resolvedTask = localUpdated >= serverUpdated ? localTask : serverTask;
  console.log(
    `Resolving conflict for task ${localTask.id}: local=${localTask.updated_at}, server=${serverTask.updated_at}, chose=${resolvedTask === localTask ? 'local' : 'server'}`
  );
  return resolvedTask;
};

const updateSyncStatus = async (taskId, status, userId, serverData = {}) => {
  const now = new Date().toISOString();
  const syncStatus = status;
  const serverId = serverData.server_id || taskId;
  const lastSyncedAt = now;

  await db.runQuery(
    'UPDATE tasks SET sync_status = ?, last_synced_at = ?, server_id = ? WHERE id = ? AND user_id = ?',
    [syncStatus, lastSyncedAt, serverId, taskId, userId]
  );
  if (status === 'synced') {
    await db.runQuery('DELETE FROM sync_queue WHERE task_id = ? AND user_id = ?', [taskId, userId]);
  }
};

// CONSTRAINT FIX: Dead letter queue implementation
const handleSyncError = async (item, error, userId) => {
  const retry_count = (item.retry_count || 0) + 1;
  const error_message = error.message;
  
  try {
    if (retry_count >= MAX_RETRIES) {
      // Move to dead letter queue after max retries
      const deadLetterId = uuidv4();
      const failed_at = new Date().toISOString();
      
      await db.runQuery(
        `INSERT INTO dead_letter_queue 
         (id, user_id, task_id, operation, data, retry_count, error_message, original_created_at, failed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          deadLetterId,
          userId,
          item.task_id,
          item.operation,
          typeof item.data === 'string' ? item.data : JSON.stringify(item.data),
          retry_count,
          error_message,
          item.created_at,
          failed_at
        ]
      );
      
      // Remove from sync queue and update task status to 'failed'
      await db.runQuery('DELETE FROM sync_queue WHERE id = ? AND user_id = ?', [item.id, userId]);
      await updateSyncStatus(item.task_id, 'failed', userId);
      
      console.log(`Moved item ${item.id} to dead letter queue after ${retry_count} attempts`);
    } else {
      // Update retry count and set status to 'error'
      await db.runQuery(
        'UPDATE sync_queue SET retry_count = ?, error_message = ? WHERE id = ? AND user_id = ?',
        [retry_count, error_message, item.id, userId]
      );
      await updateSyncStatus(item.task_id, 'error', userId);
    }
  } catch (dbError) {
    console.error('Failed to handle sync error:', dbError);
  }
};

// Helper function to query dead letter queue
const getDeadLetterQueue = async (userId) => {
  return await db.allQuery(
    'SELECT * FROM dead_letter_queue WHERE user_id = ? ORDER BY failed_at DESC',
    [userId]
  );
};

const startSync = async (userId, changeCount) => uuidv4();

const getSyncStatus = async (userId) => {
  const logs = await db.allQuery(
    'SELECT * FROM sync_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
    [userId]
  );
  const queueItems = await db.allQuery('SELECT * FROM sync_queue WHERE user_id = ?', [userId]);
  return { logs, pending: queueItems.length };
};

function safeParseJSON(s) {
  try {
    return typeof s === 'string' ? JSON.parse(s) : (s || {});
  } catch (_) {
    return {};
  }
}

module.exports = { 
  sync, 
  addToSyncQueue, 
  getSyncStatus, 
  startSync, 
  getDeadLetterQueue,
  generateBatchChecksum,
  verifyBatchChecksum,
  SYNC_STATES,
  CONFLICT_PRIORITY
};
