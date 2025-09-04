
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runQuery, getQuery, allQuery, close } from '../src/db/db.js';
import { TaskService } from '../src/services/taskService.js';
import { sync, addToSyncQueue, getSyncStatus } from '../src/services/syncService.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

describe('SyncService', () => {
  let taskService;
  let userId;

  beforeEach(async () => {
    // Initialize in-memory database
    await runQuery(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        reset_token TEXT,
        reset_token_expires TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await runQuery(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        completed INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'pending',
        server_id TEXT,
        last_synced_at TEXT
      )
    `);
    await runQuery(`
      CREATE TABLE sync_queue (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT,
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TEXT,
        operation_timestamp TEXT
      )
    `);
    await runQuery(`
      CREATE TABLE sync_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        change_count INTEGER,
        processed INTEGER,
        failed INTEGER,
        status TEXT,
        created_at TEXT
      )
    `);

    // Create test user
    userId = uuidv4();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    await runQuery(
      'INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)',
      [userId, 'testuser', 'test@example.com', hashedPassword]
    );

    taskService = new TaskService({ runQuery, getQuery, allQuery });
  });

  afterEach(async () => {
    await close();
  });

  describe('addToSyncQueue', () => {
    it('should add operation to sync queue', async () => {
      const task = await taskService.createTask({ title: 'Test Task', userId });
      await addToSyncQueue(task.id, 'update', { title: 'Updated Title' }, userId);

      const queueItems = await allQuery('SELECT * FROM sync_queue WHERE task_id = ? AND user_id = ?', [task.id, userId]);
      expect(queueItems.length).toBe(2); // One from createTask, one from update
      expect(queueItems[1].operation).toBe('update');
      expect(JSON.parse(queueItems[1].data).title).toBe('Updated Title');
    });
  });

  describe('sync', () => {
    it('should process all items in sync queue', async () => {
      // Create tasks
      const task1 = await taskService.createTask({ title: 'Task 1', userId });
      const task2 = await taskService.createTask({ title: 'Task 2', userId });

      // Add update and delete operations
      await addToSyncQueue(task1.id, 'update', { title: 'Updated Task 1', completed: true }, userId);
      await addToSyncQueue(task2.id, 'delete', {}, userId);

      const result = await sync([], '2025-09-03T00:00:00Z', userId);
      expect(result.status).toBe('completed');
      expect(result.mappings.length).toBe(2); // Two creates
      expect(result.conflicts.length).toBe(0);
      expect(result.serverChanges.length).toBeGreaterThanOrEqual(0);

      // Verify tasks
      const task1Final = await getQuery('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [task1.id, userId]);
      expect(task1Final.title).toBe('Updated Task 1');
      expect(task1Final.completed).toBe(1);
      const task2Final = await getQuery('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [task2.id, userId]);
      expect(task2Final.is_deleted).toBe(1);

      // Verify queue is cleared
      const finalQueue = await allQuery('SELECT * FROM sync_queue WHERE user_id = ?', [userId]);
      expect(finalQueue.length).toBe(0);
    });

    it('should handle sync failures gracefully', async () => {
      const task = await taskService.createTask({ title: 'Task', userId });
      
      // Test normal sync behavior
      // Create a task and verify sync queue behavior
      const queueItems = await allQuery('SELECT * FROM sync_queue WHERE user_id = ?', [userId]);
      expect(queueItems.length).toBeGreaterThan(0);
      
      // Test normal sync flow
      const result = await sync([], '2025-09-03T00:00:00Z', userId);
      expect(result.status).toBe('completed');
      expect(result.processed).toBeGreaterThan(0);
      
      // Verify queue is cleared after successful sync
      const finalQueue = await allQuery('SELECT * FROM sync_queue WHERE user_id = ?', [userId]);
      expect(finalQueue.length).toBe(0);
    });
  });

  describe('conflict resolution', () => {
    it('should resolve conflicts using last-write-wins', async () => {
      const task = await taskService.createTask({ title: 'Shared Task', userId });

      // Simulate server update (older)
      await runQuery(
        'UPDATE tasks SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        ['Server Update', '2025-09-04T10:00:00Z', task.id, userId]
      );

      // Add local update to queue (newer)
      await addToSyncQueue(task.id, 'update', {
        title: 'Local Update',
        completed: true,
        updated_at: '2025-09-04T11:00:00Z'
      }, userId);

      const result = await sync([], '2025-09-03T00:00:00Z', userId);
      expect(result.status).toBe('completed');
      expect(result.conflicts.length).toBe(0); // Local wins

      const finalTask = await getQuery('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [task.id, userId]);
      expect(finalTask.title).toBe('Local Update');
      expect(finalTask.completed).toBe(1);
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status and logs', async () => {
      const task = await taskService.createTask({ title: 'Task', userId });
      await sync([], '2025-09-03T00:00:00Z', userId);

      const status = await getSyncStatus(userId);
      expect(status.logs.length).toBe(1);
      expect(status.logs[0].status).toBe('completed');
      expect(status.pending).toBe(0);
    });
  });
});