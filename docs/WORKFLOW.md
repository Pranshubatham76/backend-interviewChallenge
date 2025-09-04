# Task Management API - Complete Workflow Documentation

## 🎯 Overview

This document provides complete end-to-end documentation of the Task Management API workflow, covering every aspect from initial setup to advanced synchronization scenarios. It serves as a comprehensive guide for understanding how the offline-first task management system operates.

---

## 🏗️ System Architecture

### **High-Level Flow**
```
Client Device (Offline) → Local SQLite DB → Sync Queue → Online Sync → Server Response
```

### **Core Components**
1. **Authentication Layer**: JWT-based user authentication
2. **Task Management**: CRUD operations for tasks
3. **Sync Engine**: Offline-first synchronization system
4. **Database Layer**: SQLite with proper schema and indexing
5. **Email Service**: Notification and password reset system

---

## 🚀 Complete API Workflow

### **Phase 1: User Onboarding & Authentication**

#### **Step 1.1: User Registration**
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (201 Created):**
```json
{
  "message": "User created successfully",
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Database Changes:**
- User record created in `users` table
- Password hashed with bcrypt (10 salt rounds)
- Unique email constraint enforced

#### **Step 1.2: User Login**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com", 
  "password": "securepassword123"
}
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "user",
  "email": "user@example.com",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**System Actions:**
1. Password verification using bcrypt
2. JWT token generation (expires in configured time)
3. Email notification sent (if email service configured)
4. User session established

#### **Step 1.3: Token Usage**
All subsequent API calls include:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### **Phase 2: Task Management Operations**

#### **Step 2.1: Create Task**
```http
POST /api/tasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Complete project documentation",
  "description": "Write comprehensive docs for the new API"
}
```

**Response (201 Created):**
```json
{
  "id": "task-uuid-123",
  "title": "Complete project documentation", 
  "description": "Write comprehensive docs for the new API",
  "completed": false,
  "created_at": "2024-01-10T10:00:00Z",
  "updated_at": "2024-01-10T10:00:00Z",
  "is_deleted": false,
  "sync_status": "pending",
  "server_id": null,
  "last_synced_at": null
}
```

**Database Changes:**
1. Task inserted into `tasks` table
2. Sync queue entry created with operation: "create"
3. UUID generated for task identification
4. Timestamps set to current ISO time

**Sync Queue Entry:**
```json
{
  "id": "queue-uuid-456",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "task_id": "task-uuid-123", 
  "operation": "create",
  "data": "{\"title\":\"Complete project documentation\",\"description\":\"Write comprehensive docs for the new API\",\"completed\":false}",
  "retry_count": 0,
  "created_at": "2024-01-10T10:00:00Z"
}
```

#### **Step 2.2: Get All Tasks**
```http
GET /api/tasks
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
[
  {
    "id": "task-uuid-123",
    "title": "Complete project documentation",
    "description": "Write comprehensive docs for the new API", 
    "completed": false,
    "created_at": "2024-01-10T10:00:00Z",
    "updated_at": "2024-01-10T10:00:00Z",
    "is_deleted": false,
    "sync_status": "pending",
    "server_id": null,
    "last_synced_at": null
  }
]
```

**Database Query:**
```sql
SELECT * FROM tasks 
WHERE user_id = ? AND is_deleted = 0 
ORDER BY updated_at DESC
```

#### **Step 2.3: Update Task**
```http
PUT /api/tasks/task-uuid-123
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated documentation task",
  "completed": true
}
```

**Response (200 OK):**
```json
{
  "id": "task-uuid-123",
  "title": "Updated documentation task",
  "description": "Write comprehensive docs for the new API",
  "completed": true,
  "created_at": "2024-01-10T10:00:00Z", 
  "updated_at": "2024-01-10T11:00:00Z",
  "is_deleted": false,
  "sync_status": "pending",
  "server_id": null,
  "last_synced_at": null
}
```

**Database Changes:**
1. Task record updated with new values
2. `updated_at` timestamp refreshed
3. `sync_status` set to "pending"
4. New sync queue entry created with operation: "update"

#### **Step 2.4: Delete Task (Soft Delete)**
```http
DELETE /api/tasks/task-uuid-123
Authorization: Bearer <token>
```

**Response (204 No Content):**
```
(No response body - 204 status code)
```

**Database Changes:**
1. Task marked as deleted: `is_deleted = 1`
2. `updated_at` timestamp refreshed
3. `sync_status` set to "pending"
4. Sync queue entry created with operation: "delete"

---

### **Phase 3: Offline Operations**

#### **Scenario: User Goes Offline**
When internet connection is lost, the app continues to work:

1. **Task Creation Offline:**
   - Task saved to local SQLite database
   - Added to sync queue with operation "create"
   - User sees immediate feedback

2. **Task Updates Offline:**
   - Local database updated immediately
   - Change queued for sync
   - `sync_status` remains "pending"

3. **Multiple Operations:**
   - All operations accumulate in sync queue
   - No data is lost
   - User can continue working seamlessly

**Example Offline Queue State:**
```json
[
  {
    "id": "queue-1", 
    "operation": "create",
    "task_id": "task-offline-1",
    "data": {"title": "Offline Task 1"}
  },
  {
    "id": "queue-2",
    "operation": "update", 
    "task_id": "task-uuid-123",
    "data": {"completed": true}
  },
  {
    "id": "queue-3",
    "operation": "delete",
    "task_id": "task-offline-2", 
    "data": {}
  }
]
```

---

### **Phase 4: Synchronization Process**

#### **Step 4.1: Trigger Sync**
```http
POST /api/sync
Authorization: Bearer <token>
Content-Type: application/json

{
  "changes": [
    {
      "operation": "create",
      "local_id": "client-task-1", 
      "data": {
        "title": "New client task",
        "description": "Created on client",
        "completed": false
      }
    }
  ],
  "last_synced_at": "2024-01-10T09:00:00Z"
}
```

**System Processing:**
1. **Queue Client Changes**: Add incoming changes to sync queue
2. **Read Local Queue**: Get all pending operations for user
3. **Batch Processing**: Group operations into batches (default: 50 items)
4. **Process Each Batch**: Execute operations sequentially
5. **Conflict Resolution**: Apply last-write-wins strategy
6. **Update Sync Status**: Mark processed items as "synced"
7. **Generate Response**: Return mappings, conflicts, and server changes

**Response (200 OK):**
```json
{
  "mappings": [
    {
      "local_id": "client-task-1",
      "server_id": "server-task-uuid-789"
    }
  ],
  "conflicts": [],
  "serverChanges": [
    {
      "id": "server-task-uuid-789",
      "title": "New client task",
      "description": "Created on client",
      "completed": false,
      "sync_status": "synced",
      "last_synced_at": "2024-01-10T11:00:00Z"
    }
  ],
  "status": "completed",
  "processed": 3,
  "failed": 0,
  "syncId": "sync-uuid-456"
}
```

#### **Step 4.2: Conflict Resolution Example**

**Scenario: Same task updated on multiple devices**

**Device A Update (10:00 AM):**
```json
{
  "task_id": "task-uuid-123",
  "operation": "update",
  "data": {
    "title": "Updated from Device A", 
    "updated_at": "2024-01-10T10:00:00Z"
  }
}
```

**Device B Update (11:00 AM):**
```json
{
  "task_id": "task-uuid-123", 
  "operation": "update",
  "data": {
    "title": "Updated from Device B",
    "updated_at": "2024-01-10T11:00:00Z"
  }
}
```

**Conflict Resolution Process:**
1. **Compare Timestamps**: Device B (11:00) vs Device A (10:00)
2. **Apply Last-Write-Wins**: Device B wins (more recent)
3. **Log Resolution**: Record conflict resolution details
4. **Update Database**: Apply Device B changes
5. **Notify Client**: Return resolution in sync response

**Conflict Log:**
```
Resolving conflict for task task-uuid-123: 
local=2024-01-10T11:00:00Z, server=2024-01-10T10:00:00Z, chose=local
```

#### **Step 4.3: Batch Processing Details**

**Large Sync Queue Example (150 items):**
1. **Batch 1**: Items 1-50 processed
2. **Batch 2**: Items 51-100 processed  
3. **Batch 3**: Items 101-150 processed

**Processing Per Batch:**
```javascript
for (const batch of batches) {
  const { mappings, conflicts, processed, failed } = await processBatch(batch, userId);
  // Accumulate results
}
```

---

### **Phase 5: Status and Monitoring**

#### **Step 5.1: Check Sync Status**
```http
GET /api/sync/status
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "pending_sync_count": 3,
  "last_sync_timestamp": "2024-01-10T10:00:00Z",
  "is_online": true,
  "sync_queue_size": 3
}
```

#### **Step 5.2: Health Check**
```http
GET /api/sync/health
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-10T11:30:00Z"
}
```

---

### **Phase 6: Advanced Features**

#### **Step 6.1: Password Reset Workflow**

**Request Reset:**
```http
POST /api/auth/request-reset
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response (200 OK):**
```json
{
  "message": "Password reset email sent"
}
```

**System Actions:**
1. Generate secure reset token (UUID)
2. Store token with 1-hour expiration
3. Send email with reset link
4. Log reset request

**Complete Reset:**
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "resetToken": "reset-uuid-789",
  "newPassword": "newSecurePassword456"
}
```

**Response (200 OK):**
```json
{
  "message": "Password reset successful"
}
```

---

## 📊 Database Schema & Relationships

### **Tables Structure**

#### **1. Users Table**
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,              -- UUID
  username TEXT,                    -- Optional display name
  email TEXT UNIQUE NOT NULL,       -- Login identifier  
  password TEXT NOT NULL,           -- bcrypt hashed
  reset_token TEXT,                 -- Password reset token
  reset_token_expires TEXT,         -- Token expiration
  is_deleted INTEGER DEFAULT 0,     -- Soft delete flag
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### **2. Tasks Table**
```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,              -- UUID
  user_id TEXT NOT NULL,            -- Owner reference
  title TEXT NOT NULL,              -- Task title
  description TEXT,                 -- Optional description
  completed INTEGER DEFAULT 0,      -- Boolean (0/1)
  created_at TEXT NOT NULL,         -- ISO timestamp
  updated_at TEXT NOT NULL,         -- ISO timestamp  
  is_deleted INTEGER DEFAULT 0,     -- Soft delete (0/1)
  sync_status TEXT DEFAULT 'pending', -- pending/synced/error
  server_id TEXT,                   -- Server-assigned ID
  last_synced_at TEXT,              -- Last sync timestamp
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### **3. Sync Queue Table**
```sql
CREATE TABLE sync_queue (
  id TEXT PRIMARY KEY,              -- Queue item UUID
  user_id TEXT NOT NULL,            -- Owner reference
  task_id TEXT NOT NULL,            -- Target task
  operation TEXT NOT NULL,          -- create/update/delete
  data TEXT NOT NULL,               -- JSON payload
  retry_count INTEGER DEFAULT 0,    -- Retry attempts
  error_message TEXT,               -- Last error
  created_at TEXT NOT NULL,         -- Queue timestamp
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

#### **4. Sync Logs Table**
```sql
CREATE TABLE sync_logs (
  id TEXT PRIMARY KEY,              -- Log UUID
  user_id TEXT NOT NULL,            -- Owner reference
  change_count INTEGER NOT NULL,    -- Total items processed
  processed INTEGER DEFAULT 0,      -- Successfully processed
  failed INTEGER DEFAULT 0,         -- Failed items
  status TEXT NOT NULL,             -- completed/error
  created_at TEXT NOT NULL,         -- Log timestamp
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 🔄 Detailed Sync Workflow

### **Offline Operations Flow**

```mermaid
graph TD
    A[User Action] --> B{Internet Available?}
    B -->|No| C[Save to Local DB]
    C --> D[Add to Sync Queue]
    D --> E[Return Success to User]
    B -->|Yes| F[Process Online]
    F --> G[Execute Operation]
    G --> H[Add to Sync Queue]
    H --> I[Trigger Auto-Sync]
```

### **Sync Process Detailed Steps**

#### **1. Sync Initiation**
```javascript
// User triggers sync or auto-sync occurs
const syncResult = await sync(clientChanges, lastSyncTimestamp, userId);
```

#### **2. Queue Processing**
```javascript
// Step 2.1: Add client changes to queue
for (const change of clientChanges) {
  await addToSyncQueue(change.task_id, change.operation, change.data, userId);
}

// Step 2.2: Read existing queue
const queueItems = await db.allQuery(
  'SELECT * FROM sync_queue WHERE user_id = ? ORDER BY created_at, id',
  [userId]
);

// Step 2.3: Create batches
const batches = [];
for (let i = 0; i < queueItems.length; i += BATCH_SIZE) {
  batches.push(queueItems.slice(i, i + BATCH_SIZE));
}
```

#### **3. Batch Processing**
```javascript
for (const batch of batches) {
  for (const item of batch) {
    try {
      // Process individual operation
      const result = await processItem(item, item.data, userId);
      
      // Handle mapping for create operations
      if (result.mapping) mappings.push(result.mapping);
      
      // Handle conflicts
      if (result.conflict) conflicts.push(result.conflict);
      
      // Update sync status
      await updateSyncStatus(item.task_id, 'synced', userId);
      
      // Remove from queue
      await db.runQuery('DELETE FROM sync_queue WHERE id = ?', [item.id]);
      
      processed++;
    } catch (error) {
      // Handle sync errors
      await handleSyncError(item, error, userId);
      failed++;
    }
  }
}
```

#### **4. Conflict Resolution Process**
```javascript
const resolveConflict = async (localTask, serverTask) => {
  const localUpdated = new Date(localTask.updated_at);
  const serverUpdated = new Date(serverTask.updated_at);
  
  // Last-write-wins strategy
  const resolvedTask = localUpdated >= serverUpdated ? localTask : serverTask;
  
  console.log(
    `Resolving conflict for task ${localTask.id}: ` +
    `local=${localTask.updated_at}, server=${serverTask.updated_at}, ` +
    `chose=${resolvedTask === localTask ? 'local' : 'server'}`
  );
  
  return resolvedTask;
};
```

---

## 🔐 Authentication & Authorization Flow

### **JWT Token Lifecycle**

#### **1. Token Generation**
```javascript
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    JWT_SECRET,
    { expiresIn: '24h' } // Configurable expiration
  );
};
```

#### **2. Token Validation Middleware**
```javascript
const protect = async (req, res, next) => {
  // Extract token from Authorization header
  const token = req.headers.authorization?.split(' ')[1];
  
  // Verify token
  const decoded = jwt.verify(token, JWT_SECRET);
  
  // Fetch user from database
  const user = await getQuery('SELECT id, username, email FROM users WHERE id = ?', [decoded.id]);
  
  // Attach user to request
  req.user = user;
  next();
};
```

#### **3. Protected Route Usage**
```javascript
router.get('/', protect, async (req, res) => {
  // req.user is available here
  const tasks = await TaskService.getAllTasks(req.user.id);
  res.json(tasks);
});
```

---

## 📈 Error Handling Workflow

### **Error Response Format**
All API errors follow this standard format:
```json
{
  "error": "Descriptive error message",
  "timestamp": "2024-01-10T11:30:00Z",
  "path": "/api/endpoint/that/failed"
}
```

### **Error Types and Handling**

#### **1. Validation Errors (400)**
```javascript
// Joi validation middleware
const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      error: error.details.map(d => d.message),
      timestamp: new Date().toISOString(),
      path: req.path
    });
  }
  next();
};
```

#### **2. Authentication Errors (401)**
```javascript
// JWT verification errors
if (error.name === 'TokenExpiredError') {
  return res.status(401).json({ message: 'Token expired' });
}
if (error.name === 'JsonWebTokenError') {
  return res.status(401).json({ message: 'Invalid token' });
}
```

#### **3. Not Found Errors (404)**
```javascript
const task = await TaskService.getTaskById(id, userId);
if (!task) {
  return res.status(404).json({
    error: "Task not found",
    timestamp: new Date().toISOString(),
    path: `/api/tasks/${id}`
  });
}
```

#### **4. Sync Errors & Retries**
```javascript
const handleSyncError = async (item, error, userId) => {
  const retry_count = (item.retry_count || 0) + 1;
  
  if (retry_count >= MAX_RETRIES) {
    // Mark as permanently failed
    await updateSyncStatus(item.task_id, 'error', userId);
  } else {
    // Increment retry count
    await db.runQuery(
      'UPDATE sync_queue SET retry_count = ?, error_message = ? WHERE id = ?',
      [retry_count, error.message, item.id]
    );
  }
};
```

---

## 📧 Email Integration Workflow

### **Email Service Configuration**
```javascript
const transporter = nodemailer.createTransport({
  host: config.MAIL_SERVER,      // smtp.gmail.com
  port: config.MAIL_PORT,        // 465
  secure: config.MAIL_USE_TLS,   // true
  auth: {
    user: config.MAIL_USERNAME,  // sender email
    pass: config.MAIL_PASSWORD,  // app password
  },
});
```

### **Login Email Notification**
```javascript
const mailData = {
  from: `"${config.MAIL_SENDER_NAME}" <${config.MAIL_DEFAULT_SENDER}>`,
  to: userEmail,
  subject: 'Login Successful',
  html: `
    <p>You have successfully logged in to your Task Management account.</p>
    <p>Use this token: <strong>${token}</strong></p>
  `
};

// Send only in non-test environments
if (process.env.NODE_ENV !== 'test') {
  await transporter.sendMail(mailData);
}
```

### **Password Reset Email**
```javascript
const resetUrl = `http://localhost:${config.PORT}/api/auth/reset-password?token=${resetToken}`;
const mailOptions = {
  from: `"${config.MAIL_SENDER_NAME}" <${config.MAIL_DEFAULT_SENDER}>`,
  to: email,
  subject: 'Password Reset Request',
  html: `
    <p>You requested a password reset for your Task Management account.</p>
    <p>Click <a href="${resetUrl}">here</a> to reset your password.</p>
    <p>Or use this token: <strong>${resetToken}</strong></p>
    <p>This link/token expires in 1 hour.</p>
  `
};
```

---

## 🎯 Complete Use Case Scenarios

### **Scenario 1: New User Onboarding**
1. User registers with email/password
2. User receives confirmation (if email configured)
3. User logs in and gets JWT token
4. User creates first task
5. Task appears immediately (optimistic update)
6. Sync queue contains create operation
7. When online, sync processes the queue
8. Task gets server_id and synced status

### **Scenario 2: Multi-Device Usage**
1. User creates task on Device A
2. Task syncs to server
3. User opens app on Device B
4. Device B syncs and receives new task
5. User updates task on Device B
6. Device B goes offline
7. Update stays in Device B sync queue
8. When Device B comes online, update syncs
9. Device A receives update on next sync

### **Scenario 3: Conflict Resolution**
1. User updates task on Device A (offline)
2. User updates same task on Device B (offline)
3. Device A comes online and syncs first
4. Device B comes online and syncs second
5. System detects conflict (same task, different updates)
6. Last-write-wins applied based on updated_at
7. Losing change is logged as conflict
8. All devices eventually have the same data

### **Scenario 4: Network Failure Recovery**
1. User performs multiple operations offline
2. User comes online and triggers sync
3. Network fails during sync process
4. Failed operations remain in queue with retry count
5. User tries sync again
6. System retries failed operations
7. After 3 failures, operations marked as error
8. User can manually review and retry if needed

---

## 🚀 Performance Optimization Features

### **1. Database Optimization**
```sql
-- Indexes for fast queries
CREATE INDEX idx_tasks_user_id_updated_at ON tasks(user_id, updated_at);
CREATE INDEX idx_sync_queue_user_id ON sync_queue(user_id);
CREATE INDEX idx_sync_logs_user_id ON sync_logs(user_id);
```

### **2. Batch Processing**
- Configurable batch size (default: 50)
- Prevents memory issues with large queues
- Parallel processing within batches

### **3. Connection Management**
```javascript
// Shared database instance
const DB_GLOBAL_KEY = '__TASKS_SQLITE_DB__';
function getDb() {
  if (!globalThis[DB_GLOBAL_KEY]) {
    globalThis[DB_GLOBAL_KEY] = createDbInstance();
  }
  return globalThis[DB_GLOBAL_KEY];
}
```

### **4. Query Optimization**
- Prepared statements for all database operations
- Minimal data transfer (only required fields)
- Efficient sorting and filtering

---

## 🧪 Testing Workflow

### **Test Categories**

#### **1. Unit Tests (TaskService)**
- Task creation with default values
- Task updates with partial data
- Task deletion (soft delete)
- Non-existent task handling
- Sync queue integration

#### **2. Unit Tests (SyncService)**
- Sync queue operations
- Batch processing
- Conflict resolution
- Status tracking
- Error handling

#### **3. Integration Tests**
- Complete offline-to-online workflows
- Multi-device conflict scenarios  
- Authentication and authorization
- Password reset flows
- Error recovery scenarios

#### **4. Compliance Tests**
- API specification adherence
- Response format validation
- HTTP status code verification
- Error format consistency

### **Test Execution Flow**
```bash
# 1. Environment Setup
process.env.NODE_ENV = 'test'
process.env.DATABASE_URI = ':memory:'

# 2. Database Initialization
beforeEach: Create fresh in-memory database
beforeEach: Create test user
beforeEach: Initialize TaskService

# 3. Test Execution
Run individual test cases

# 4. Cleanup
afterEach: Close database connections
afterEach: Clear global state
```

---

## 🎁 Extra Features Integration

### **1. User Management System**
- Complete CRUD operations for users
- Profile management
- Admin features (get all users)
- Soft delete for users

### **2. Email Notification System**
- Login confirmations
- Password reset emails  
- Configurable email templates
- Graceful degradation if email service unavailable

### **3. Request Validation**
- Joi schema validation for all inputs
- Comprehensive error messages
- Type safety and constraint checking

### **4. Development Tools**
- Multiple testing approaches
- Manual testing scripts
- API compliance validation
- Code quality tools (ESLint)

---

## 📋 API Response Examples

### **Success Responses**

#### **Task List Response**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Complete project documentation",
    "description": "Write comprehensive docs for the new API",
    "completed": false,
    "created_at": "2024-01-10T10:00:00Z",
    "updated_at": "2024-01-10T10:00:00Z", 
    "is_deleted": false,
    "sync_status": "synced",
    "server_id": "srv_123456",
    "last_synced_at": "2024-01-10T10:05:00Z"
  }
]
```

#### **Sync Response**
```json
{
  "mappings": [
    {
      "local_id": "client-uuid-123",
      "server_id": "server-uuid-456"
    }
  ],
  "conflicts": [],
  "serverChanges": [
    {
      "id": "server-uuid-789",
      "title": "Server-side task",
      "updated_at": "2024-01-10T11:00:00Z"
    }
  ],
  "status": "completed",
  "processed": 5,
  "failed": 0,
  "syncId": "sync-uuid-123"
}
```

### **Error Responses**

#### **Validation Error (400)**
```json
{
  "error": ["\"title\" is required", "\"email\" must be a valid email"],
  "timestamp": "2024-01-10T11:30:00Z",
  "path": "/api/tasks"
}
```

#### **Not Found Error (404)**
```json
{
  "error": "Task not found",
  "timestamp": "2024-01-10T11:30:00Z", 
  "path": "/api/tasks/invalid-uuid"
}
```

#### **Authentication Error (401)**
```json
{
  "message": "Invalid token"
}
```

---

## 🎯 Production Deployment Workflow

### **1. Environment Setup**
```bash
# Production environment variables
JWT_SECRET_KEY=your-production-secret
DATABASE_URI=./production-tasks.db
PORT=3000
SYNC_BATCH_SIZE=50
MAIL_USERNAME=your-production-email
MAIL_PASSWORD=your-app-password
```

### **2. Database Initialization**
```bash
# Database will auto-initialize on first run
npm start
# Creates tables, indexes, and applies migrations
```

### **3. Health Verification**
```bash
# Check API health
curl http://localhost:3000/api/sync/health

# Expected response
{"status":"ok","timestamp":"2024-01-10T11:30:00Z"}
```

### **4. User Workflow**
```bash
# 1. Register user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# 2. Login and get token  
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# 3. Create task
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"My First Task","description":"Getting started"}'

# 4. Sync operations
curl -X POST http://localhost:3000/api/sync \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"changes":[],"last_synced_at":"2024-01-01T00:00:00Z"}'
```

---

This comprehensive workflow documentation covers every aspect of the Task Management API, from basic operations to advanced synchronization scenarios, providing a complete understanding of the system's capabilities and usage patterns.
