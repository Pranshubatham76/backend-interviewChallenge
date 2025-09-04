import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runQuery, getQuery, allQuery, close } from '../src/db/db.js';
import { TaskService } from '../src/services/taskService.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';


describe('TaskService', () => {
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

  describe('createTask', () => {
    it('should create a new task with default values', async () => {
      const taskData = { title: 'Test Task', description: 'Test Description', userId };
      const task = await taskService.createTask(taskData);

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('Test Description');
      expect(task.completed).toBe(0);
      expect(task.is_deleted).toBe(0);
      expect(task.sync_status).toBe('pending');
      expect(task.user_id).toBe(userId);

      // Check sync queue
      const syncQueue = await allQuery('SELECT * FROM sync_queue WHERE task_id = ? AND user_id = ?', [task.id, userId]);
      expect(syncQueue.length).toBe(1);
      expect(syncQueue[0].operation).toBe('create');
    });
  });

  describe('updateTask', () => {
    it('should update an existing task', async () => {
      const task = await taskService.createTask({ title: 'Original Title', userId });
      const updated = await taskService.updateTask(task.id, { title: 'Updated Title', completed: true }, userId);

      expect(updated).toBeDefined();
      expect(updated.title).toBe('Updated Title');
      expect(updated.completed).toBe(1);
      expect(updated.sync_status).toBe('pending');

      // Check sync queue
      const syncQueue = await allQuery('SELECT * FROM sync_queue WHERE task_id = ? AND user_id = ?', [task.id, userId]);
      expect(syncQueue.length).toBe(2); // create + update
      expect(syncQueue[1].operation).toBe('update');
    });

    it('should return null for non-existent task', async () => {
      const result = await taskService.updateTask('non-existent-id', { title: 'Test' }, userId);
      expect(result).toBeNull();
    });
  });

  describe('deleteTask', () => {
    it('should soft delete a task', async () => {
      const task = await taskService.createTask({ title: 'To Delete', userId });
      const result = await taskService.deleteTask(task.id, userId);
      expect(result).toBe(true);

      const deleted = await getQuery('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [task.id, userId]);
      expect(deleted.is_deleted).toBe(1);
      expect(deleted.sync_status).toBe('pending');

      // Check sync queue
      const syncQueue = await allQuery('SELECT * FROM sync_queue WHERE task_id = ? AND user_id = ?', [task.id, userId]);
      expect(syncQueue.length).toBe(2); // create + delete
      expect(syncQueue[1].operation).toBe('delete');
    });

    it('should return false for non-existent task', async () => {
      const result = await taskService.deleteTask('non-existent-id', userId);
      expect(result).toBe(false);
    });
  });

  describe('getTaskByIdIncludingDeleted', () => {
    it('should return task including deleted ones', async () => {
      const task = await taskService.createTask({ title: 'Task', userId });
      await taskService.deleteTask(task.id, userId);

      const result = await taskService.getTaskByIdIncludingDeleted(task.id, userId);
      expect(result).toBeDefined();
      expect(result.id).toBe(task.id);
      expect(result.is_deleted).toBe(1);
    });

    it('should return null for non-existent task', async () => {
      const result = await taskService.getTaskByIdIncludingDeleted('non-existent-id', userId);
      expect(result).toBeNull();
    });
  });
});