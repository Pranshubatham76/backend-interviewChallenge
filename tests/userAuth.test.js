import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { runQuery, getQuery, allQuery, close } from '../src/db/db.js';
import authRoutes from '../src/routes/userAuth.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Setup Express app for testing
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('User Authentication Routes', () => {
  let testUserId;
  let authToken;

  beforeEach(async () => {
    // Initialize in-memory database
    await runQuery(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        reset_token TEXT,
        reset_token_expires TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create test user with hashed password
    testUserId = uuidv4();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    await runQuery(
      'INSERT INTO users (id, username, email, password, is_deleted) VALUES (?, ?, ?, ?, ?)',
      [testUserId, 'testuser', 'test@example.com', hashedPassword, 0]
    );

    // Login to get authentication token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });
    
    authToken = loginRes.body.token;
  });

  afterEach(async () => {
    await close();
  });

  describe('User Registration', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'newpassword123',
          username: 'newuser'
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User created successfully');
      expect(response.body.userId).toBeDefined();
    });

    it('should fail to register user with existing email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com', // Already exists
          password: 'password123',
          username: 'testuser2'
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Error creating user');
    });
  });

  describe('User Login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.id).toBe(testUserId);
      expect(response.body.email).toBe('test@example.com');
    });

    it('should fail login with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBeDefined();
    });
  });

  describe('Get All Users', () => {
    it('should retrieve all users successfully', async () => {
      const response = await request(app)
        .post('/api/auth/getAllUser');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User fetched successfully');
      expect(Array.isArray(response.body.users)).toBe(true);
      expect(response.body.users.length).toBeGreaterThan(0);
    });
  });

  describe('Get User By ID', () => {
    it('should retrieve user by ID successfully', async () => {
      const response = await request(app)
        .post(`/api/auth/getUserById/${testUserId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User fetched successfully');
      expect(response.body.user.id).toBe(testUserId);
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should handle non-existent user ID', async () => {
      const fakeId = uuidv4();
      const response = await request(app)
        .post(`/api/auth/getUserById/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Error fetching user');
    });
  });

  describe('Update User', () => {
    it('should update user successfully with authentication', async () => {
      const response = await request(app)
        .post(`/api/auth/updateUser/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'updated@example.com',
          password: 'newpassword456'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User updated successfully');
      expect(response.body.user).toBeDefined();
    });

    it('should fail to update user without authentication', async () => {
      const response = await request(app)
        .post(`/api/auth/updateUser/${testUserId}`)
        .send({
          email: 'updated@example.com'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('Delete User', () => {
    it('should delete user successfully with authentication', async () => {
      const response = await request(app)
        .post(`/api/auth/deleteUser/${testUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User deleted successfully');
      expect(response.body.userId).toBe(testUserId);
    });

    it('should fail to delete user without authentication', async () => {
      const response = await request(app)
        .post(`/api/auth/deleteUser/${testUserId}`);

      expect(response.status).toBe(401);
    });
  });

  describe('Password Reset Flow', () => {
    it('should request password reset successfully', async () => {
      const response = await request(app)
        .post('/api/auth/request-reset')
        .send({
          email: 'test@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password reset email sent');
    });

    it('should handle password reset request for non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/request-reset')
        .send({
          email: 'nonexistent@example.com'
        });

      expect(response.status).toBe(400);
    });
  });
});
