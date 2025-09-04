const { runQuery, getQuery, allQuery } = require('../db/db');
const { v4: uuidv4 } = require('uuid');

// 1. Get all tasks
const getAllTasks = async (userId) => {
  if (!userId) throw new Error('User ID is required');
  const sql = `
    SELECT * FROM tasks
    WHERE user_id = ? AND is_deleted = 0
    ORDER BY updated_at DESC
  `;
  return await allQuery(sql, [userId]);
};

// 2. Get task by id
const getTaskById = async (id, userId) => {
  if (!id) throw new Error('Task ID is required');
  if (!userId) throw new Error('User ID is required');
  const sql = `
    SELECT * FROM tasks
    WHERE id = ? AND user_id = ? AND is_deleted = 0
  `;
  const result = await getQuery(sql, [id, userId]);
  return result || null;
};

// 3. Get Task by ID including deleted
const getTaskByIdIncludingDeleted = async (id, userId) => {
  if (!id) throw new Error('Task ID is required');
  if (!userId) throw new Error('User ID is required');
  const sql = `
    SELECT * FROM tasks
    WHERE id = ? AND user_id = ?
  `;
  const result = await getQuery(sql, [id, userId]);
  return result || null;
};

// 4. Create new task
const createTask = async ({ title, description = '', completed = false }, userId) => {
  if (!userId) throw new Error('User ID is required');
  if (!title) throw new Error('Title is required');

  const id = uuidv4();
  const now = new Date().toISOString();
  const task = {
    id,
    user_id: userId,
    title,
    description: description || '',
    completed: completed ? 1 : 0,
    created_at: now,
    updated_at: now,
    is_deleted: 0,
    sync_status: 'pending',
    server_id: null,
    last_synced_at: null,
  };

  const sql = `
    INSERT INTO tasks (
      id, user_id, title, description, completed, created_at, updated_at, is_deleted, sync_status, server_id, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await runQuery(sql, [
    task.id,
    task.user_id,
    task.title,
    task.description,
    task.completed,
    task.created_at,
    task.updated_at,
    task.is_deleted,
    task.sync_status,
    task.server_id,
    task.last_synced_at,
  ]);

  // enqueue create operation for sync
  await addToSyncQueue(task.id, 'create', {
    title: task.title,
    description: task.description,
    completed: !!completed,
    created_at: task.created_at,
    updated_at: task.updated_at,
  }, userId, task.created_at);

  return task;
};

// 5. Update task 
const updateTask = async (id, updates, userId) => {
  if (!id) throw new Error('Task ID is required');
  if (!userId) throw new Error('User ID is required');
  if (!updates || typeof updates !== 'object') throw new Error('Updates are required');

  const existing = await getTaskById(id, userId);
  if (!existing) return null;

  const { title, description, completed } = updates;
  const now = new Date().toISOString();

  const newTitle = title !== undefined ? title : existing.title;
  const newDescription = description !== undefined ? description : existing.description;
  const newCompleted = completed !== undefined ? (completed ? 1 : 0) : existing.completed;

  const sql = `
    UPDATE tasks
    SET title = ?, description = ?, completed = ?, updated_at = ?, sync_status = 'pending'
    WHERE id = ? AND user_id = ? AND is_deleted = 0
  `;
  await runQuery(sql, [newTitle, newDescription, newCompleted, now, id, userId]);

  // enqueue update operation for sync
  await addToSyncQueue(id, 'update', {
    title: newTitle,
    description: newDescription,
    completed: !!newCompleted,
    updated_at: now,
  }, userId, now);

  return await getTaskById(id, userId);
};

// 6. Delete task (soft delete)
const deleteTask = async (id, userId) => {
  if (!id) throw new Error('Task ID is required');
  if (!userId) throw new Error('User ID is required');

  const existing = await getTaskById(id, userId);
  if (!existing) return false;

  const now = new Date().toISOString();
  const sql = `
    UPDATE tasks
    SET is_deleted = 1, updated_at = ?, sync_status = 'pending'
    WHERE id = ? AND user_id = ?
  `;
  await runQuery(sql, [now, id, userId]);

  // enqueue delete operation for sync
  await addToSyncQueue(id, 'delete', { updated_at: now }, userId, now);

  return true;
};

// 7. Get tasks needing sync
const getTasksNeedingSync = async (userId) => {
  if (!userId) throw new Error('User ID is required');
  const sql = `
    SELECT * FROM tasks
    WHERE user_id = ? AND sync_status != 'synced'
  `;
  return await allQuery(sql, [userId]);
};

// helper function to add to sync queue
const addToSyncQueue = async (taskId, operation, data, userId, operationTimestamp = null) => {
  if (!taskId) throw new Error('Task ID is required');
  if (!operation) throw new Error('Operation is required');
  if (!userId) throw new Error('User ID is required');

  const id = uuidv4();
  const created_at = new Date().toISOString();
  const operation_timestamp = operationTimestamp || created_at;
  const sql = `
    INSERT INTO sync_queue (id, user_id, task_id, operation, data, retry_count, created_at, operation_timestamp)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `;
  await runQuery(sql, [id, userId, taskId, operation, JSON.stringify(data || {}), created_at, operation_timestamp]);
  return { id };
};

// Class wrapper compatible with tests
class TaskService {
  constructor(dbFns = { runQuery, getQuery, allQuery }) {
    this.runQuery = dbFns.runQuery;
    this.getQuery = dbFns.getQuery;
    this.allQuery = dbFns.allQuery;
  }

  async createTask({ title, description = '', completed = false, userId }) {
    return await createTask({ title, description, completed }, userId);
  }

  async updateTask(id, updates, userId) {
    return await updateTask(id, updates, userId);
  }

  async deleteTask(id, userId) {
    return await deleteTask(id, userId);
  }

  async getTaskByIdIncludingDeleted(id, userId) {
    return await getTaskByIdIncludingDeleted(id, userId);
  }
}

// Export all modules
module.exports = {
  TaskService,
  getAllTasks,
  getTaskById,
  getTaskByIdIncludingDeleted,
  createTask,
  updateTask,
  deleteTask,
  getTasksNeedingSync,
  addToSyncQueue,
};
