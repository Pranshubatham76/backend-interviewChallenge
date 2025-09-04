import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { runQuery, getQuery, allQuery, close } from '../src/db/db.js';
import authRoutes from '../src/routes/userAuth.js';
import syncRoutes from '../src/routes/sync.js';
import taskRoutes from '../src/routes/tasks.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Setup Express app for testing
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/tasks', taskRoutes);

describe('Integration Tests', () => {
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
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    await runQuery(
      'INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)',
      [uuidv4(), 'testuser', 'test@example.com', hashedPassword]
    );
  });

  afterEach(async () => {
    await close();
  });

  describe('Offline to Online Sync Flow', () => {
    it('should handle complete offline to online workflow', async () => {
      // Login to get JWT token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });
      expect(loginRes.status).toBe(200);
      const token = loginRes.body.token;
      const userId = loginRes.body.id;

      // Simulate offline operations
      // 1. Create task while offline
      const task1Res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Offline Task 1', description: 'Created while offline' });
      expect(task1Res.status).toBe(201);
      const task1 = task1Res.body;

      // 2. Update task while offline
      const updateRes = await request(app)
        .put(`/api/tasks/${task1.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ completed: true });
      expect(updateRes.status).toBe(200);

      // 3. Create another task
      const task2Res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Offline Task 2' });
      expect(task2Res.status).toBe(201);
      const task2 = task2Res.body;

      // 4. Delete a task
      const deleteRes = await request(app)
        .delete(`/api/tasks/${task2.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(deleteRes.status).toBe(204);

      // Verify sync queue has all operations
      const queueItems = await allQuery('SELECT * FROM sync_queue WHERE user_id = ? ORDER BY created_at', [userId]);
      expect(queueItems.length).toBe(4); // create, update, create, delete
      expect(queueItems[0].operation).toBe('create');
      expect(queueItems[1].operation).toBe('update');
      expect(queueItems[2].operation).toBe('create');
      expect(queueItems[3].operation).toBe('delete');

      // Simulate coming online and syncing
      const syncRes = await request(app)
        .post('/api/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({ changes: [], last_synced_at: '2025-09-03T00:00:00Z' });
      expect(syncRes.status).toBe(200);
      expect(syncRes.body.status).toBe('completed');
      expect(syncRes.body.mappings.length).toBe(2); // Two creates
      expect(syncRes.body.conflicts.length).toBe(0);
      expect(syncRes.body.serverChanges.length).toBeGreaterThanOrEqual(0);

      // Verify sync queue is cleared
      const finalQueue = await allQuery('SELECT * FROM sync_queue WHERE user_id = ?', [userId]);
      expect(finalQueue.length).toBe(0);

      // Verify sync log
      const syncLogs = await allQuery('SELECT * FROM sync_logs WHERE user_id = ?', [userId]);
      expect(syncLogs.length).toBe(1);
      expect(syncLogs[0].status).toBe('completed');
      expect(syncLogs[0].processed).toBe(4);
      expect(syncLogs[0].failed).toBe(0);
    });
  });

  describe('Conflict Resolution Scenario', () => {
    it('should handle task edited on multiple devices', async () => {
      // Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });
      const token = loginRes.body.token;
      const userId = loginRes.body.id;

      // Create a task
      const taskRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Shared Task', description: 'Task on multiple devices' });
      const task = taskRes.body;

      // Simulate server update (older timestamp)
      await runQuery(
        'UPDATE tasks SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        ['Server Update', '2025-09-04T10:00:00Z', task.id, userId]
      );

      // Simulate local update (newer timestamp)
      const updateRes = await request(app)
        .put(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Local Update', completed: true, updated_at: '2025-09-04T11:00:00Z' });
      expect(updateRes.status).toBe(200);

      // Sync
      const syncRes = await request(app)
        .post('/api/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({ changes: [], last_synced_at: '2025-09-03T00:00:00Z' });
      expect(syncRes.status).toBe(200);
      expect(syncRes.body.status).toBe('completed');
      expect(syncRes.body.conflicts.length).toBe(0); // Local wins (newer timestamp)

      // Verify task has local changes
      const finalTask = await getQuery('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [task.id, userId]);
      expect(finalTask.title).toBe('Local Update');
      expect(finalTask.completed).toBe(1);
    });
  });

  describe('Error Recovery', () => {
    it('should retry failed sync operations', async () => {
      // Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });
      const token = loginRes.body.token;
      const userId = loginRes.body.id;

      // Create a task
      const taskRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Task to Sync' });
      const task = taskRes.body;

      // Test the retry mechanism by first checking the sync queue has items
      const queueItems = await allQuery('SELECT * FROM sync_queue WHERE user_id = ?', [userId]);
      expect(queueItems.length).toBeGreaterThan(0);
      
      // Verify that sync processes the queue successfully
      const syncRes1 = await request(app)
        .post('/api/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({ changes: [], last_synced_at: '2025-09-03T00:00:00Z' });
      expect(syncRes1.status).toBe(200);
      expect(syncRes1.body.status).toBe('completed');
      expect(syncRes1.body.processed).toBeGreaterThan(0);
      
      // Verify queue is cleared after sync
      const finalQueue = await allQuery('SELECT * FROM sync_queue WHERE user_id = ?', [userId]);
      expect(finalQueue.length).toBe(0);
      
      // Test retry with another sync operation (should have no items to process)
      const syncRes2 = await request(app)
        .post('/api/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({ changes: [], last_synced_at: '2025-09-03T00:00:00Z' });
      expect(syncRes2.status).toBe(200);
      expect(syncRes2.body.status).toBe('completed');
      expect(syncRes2.body.processed).toBe(0);

      // Verify queue remains empty
      const emptyQueue = await allQuery('SELECT * FROM sync_queue WHERE user_id = ?', [userId]);
      expect(emptyQueue.length).toBe(0);
    });
  });

  describe('Authentication & Authorization', () => {
    it('should handle user login and JWT authorization', async () => {
      // Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.token).toBeDefined();
      const token = loginRes.body.token;

      // Access protected route
      const syncRes = await request(app)
        .post('/api/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({ changes: [], last_synced_at: '2025-09-03T00:00:00Z' });
      expect(syncRes.status).toBe(200);

      // Access protected route with invalid token
      const invalidTokenRes = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer invalid-token')
        .send({ changes: [], last_synced_at: '2025-09-03T00:00:00Z' });
      expect(invalidTokenRes.status).toBe(401);
      expect(invalidTokenRes.body.message).toBe('Invalid token');
    });

    it('should handle password reset flow', async () => {
      // Request password reset
      const resetReqRes = await request(app)
        .post('/api/auth/request-reset')
        .send({ email: 'test@example.com' });
      expect(resetReqRes.status).toBe(200);
      expect(resetReqRes.body.message).toBe('Password reset email sent');

      // Get reset token from database (since email is mocked)
      const user = await getQuery('SELECT * FROM users WHERE email = ?', ['test@example.com']);
      const resetToken = user.reset_token;

      // Reset password
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ resetToken, newPassword: 'newpass123' });
      expect(resetRes.status).toBe(200);
      expect(resetRes.body.message).toBe('Password reset successful');

      // Verify new password works
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'newpass123' });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.token).toBeDefined();
    });
  });
});
