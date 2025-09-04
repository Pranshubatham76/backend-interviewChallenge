# Task Sync API - Offline-First Task Management System

## 🎯 Overview

This is a backend API for a personal task management application that supports offline functionality. Built for users in India who often work in areas with intermittent internet connectivity, this API allows users to create, update, and delete tasks while offline, and then sync these changes when they come back online.

## 🏗️ Architecture & Design Approach

### Sync Strategy
I implemented a **queue-based sync system** with the following approach:

1. **Offline Operations**: All CRUD operations (create/update/delete) are added to a local sync queue
2. **Batch Processing**: When online, the sync processes items in configurable batches (default: 50 items)
3. **Conflict Resolution**: Uses "last-write-wins" strategy based on `updated_at` timestamps
4. **Error Handling**: Failed sync operations are retried up to 3 times with error logging
5. **Status Tracking**: Comprehensive sync logging and status tracking

### Database Design
- **SQLite**: Used for reliable local storage with proper foreign key constraints
- **Soft Deletes**: Tasks are marked as deleted rather than removed for sync consistency
- **Indexing**: Optimized queries with indexes on user_id and updated_at fields
- **Migration**: Auto-initialization of schema with backward compatibility

## 📋 API Endpoints

### Core Task Management (Required)
- `GET /api/tasks` - Get all non-deleted tasks
- `GET /api/tasks/:id` - Get a specific task
- `POST /api/tasks` - Create a new task
- `PUT /api/tasks/:id` - Update an existing task
- `DELETE /api/tasks/:id` - Soft delete a task (returns 204)

### Sync Operations (Required)
- `POST /api/sync` - Trigger sync operation
- `GET /api/sync/status` - Check sync status
- `POST /api/sync/batch` - Batch sync endpoint
- `GET /api/sync/health` - Health check

### Authentication & User Management (Extra Features)
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login (includes email notification)
- `POST /api/auth/request-reset` - Password reset request
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/updateUser/:id` - Update user details
- `GET /api/auth/getAllUser` - Get all users (admin feature)
- `GET /api/auth/getUserById/:id` - Get user by ID
- `DELETE /api/auth/deleteUser/:id` - Delete user

## 🎁 Extra Features Implemented

1. **Complete Authentication System**
   - JWT-based authentication
   - Password hashing with bcrypt
   - Email notifications on login
   - Password reset with secure tokens

2. **Email Integration**
   - Nodemailer integration for email notifications
   - Login confirmation emails
   - Password reset emails with secure links

3. **User Management**
   - Full CRUD operations for users
   - Soft delete for users
   - Email uniqueness validation

4. **Enhanced Error Handling**
   - Structured error responses with timestamps and paths
   - Comprehensive input validation with Joi
   - Proper HTTP status codes

5. **Performance Optimizations**
   - Database indexing
   - Configurable batch sizes
   - Connection pooling

6. **Development Tools**
   - Comprehensive test suite (17 tests)
   - Manual testing scripts
   - API compliance testing
   - ESLint configuration

## 🗃️ Data Model

### Task Model (Fully Compliant)
```javascript
{
  id: "550e8400-e29b-41d4-a716-446655440000", // UUID
  title: "Complete project documentation",      // Required
  description: "Write comprehensive docs",      // Optional
  completed: false,                            // Boolean
  created_at: "2024-01-10T10:00:00Z",         // ISO timestamp
  updated_at: "2024-01-10T10:00:00Z",         // ISO timestamp
  is_deleted: false,                           // Soft delete flag
  sync_status: "synced",                       // pending/synced/error
  server_id: "srv_123456",                     // Server-assigned ID
  last_synced_at: "2024-01-10T10:05:00Z"      // Last sync timestamp
}
```

### Sync Queue Model
```javascript
{
  id: "queue-uuid",
  user_id: "user-uuid",
  task_id: "task-uuid", 
  operation: "create", // create/update/delete
  data: {...},         // Task data at time of operation
  retry_count: 0,      // Number of retry attempts
  error_message: null, // Last error message if any
  created_at: "2024-01-10T10:00:00Z"
}
```

## 🛠️ Technical Implementation

### Conflict Resolution
- **Strategy**: Last-write-wins based on `updated_at` timestamp
- **Logging**: All conflicts are logged with resolution details
- **Handling**: More recent changes always win, preserving user intent

### Error Handling & Retries
- **Network Failures**: Gracefully handled without crashing
- **Failed Syncs**: Automatically retried up to 3 times
- **Error Logging**: Comprehensive error tracking in sync_logs table
- **User Feedback**: Meaningful error messages with proper HTTP status codes

### Performance Features
- **Batch Processing**: Configurable batch sizes (default: 50)
- **Database Optimization**: Proper indexing and query optimization
- **Connection Management**: Shared database instance with proper cleanup

## 🚀 How to Run and Test

### Installation & Setup
```bash
npm install
```

### Environment Configuration
Create/update `.env` file with:
```env
JWT_SECRET_KEY='your-secret-key'
DATABASE_URI='./tasks.db'
PORT=3000
SYNC_BATCH_SIZE=50
# Email configuration (optional for core functionality)
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=465
MAIL_USE_TLS=true
```

### Running the Server
```bash
# Production
npm start

# Development with auto-restart
npm run dev
```

### Testing

#### Automated Tests (17 test cases)
```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

#### API Compliance Testing
```bash
# Test against official API specification
npm run compliance-test
```

#### Manual Testing
```bash
# Interactive API testing
npm run manual-test
```

#### Code Quality
```bash
# Run ESLint
npm run lint

# Check TypeScript (N/A for this JS project)
npm run typecheck
```

## 📊 Test Coverage

- **TaskService**: 7 tests covering CRUD operations and edge cases
- **SyncService**: 5 tests covering queue management and conflict resolution
- **Integration**: 5 tests covering complete workflows and authentication
- **API Compliance**: 14 comprehensive endpoint tests

## 🔧 Technical Assumptions

1. **Single User per Device**: Each API instance serves one user's data
2. **Clock Synchronization**: Devices have reasonably accurate clocks for conflict resolution
3. **SQLite Compatibility**: Target environment supports SQLite3
4. **Email Optional**: Email features gracefully degrade if not configured
5. **Memory Efficiency**: Batch processing prevents memory issues with large sync queues

## 🎯 Requirements Compliance Checklist

### ✅ Core Requirements Met:
- [x] Task Management API (All endpoints implemented)
- [x] Sync Functionality (Queue-based with batch processing)
- [x] Data Model (All required fields present)
- [x] Conflict Resolution (Last-write-wins implementation)
- [x] Error Handling (Comprehensive with retries)
- [x] Performance (Batching and database optimization)

### ✅ Technical Requirements Met:
- [x] SQLite Database with proper schema
- [x] Foreign key constraints and indexing
- [x] Network failure resilience
- [x] Retry mechanism (max 3 attempts)
- [x] Meaningful error messages
- [x] Sync logging and conflict resolution logging

### 🎁 Bonus Features Implemented:
- [x] Request validation middleware (Joi)
- [x] Exponential backoff for retries
- [x] Sync progress tracking
- [x] Integration tests
- [x] Database query optimization
- [x] Complete authentication system
- [x] Email notifications
- [x] User management system

## 📁 Project Structure

```
├── src/
│   ├── db/db.js                 # Database layer
│   ├── middleware/
│   │   ├── auth.js              # JWT authentication
│   │   └── validate.js          # Request validation
│   ├── routes/
│   │   ├── tasks.js             # Task management endpoints
│   │   ├── sync.js              # Sync operation endpoints
│   │   └── userAuth.js          # Authentication endpoints
│   ├── services/
│   │   ├── taskService.js       # Task business logic
│   │   ├── syncService.js       # Sync orchestration
│   │   └── userService.js       # User management
│   ├── utils/
│   │   └── generateToken.js     # JWT token generation
│   ├── config.js                # Configuration management
│   └── server.js                # Express server setup
├── tests/                       # Test suite
├── docs/                        # Documentation
├── manual-test.js               # Manual testing script
├── api-compliance-test.js       # API spec compliance test
└── README.md                    # This file
```

## 💡 Key Design Decisions

1. **Queue-First Design**: All operations go through sync queue for consistency
2. **Optimistic Updates**: UI can update immediately while queuing sync operations
3. **Graceful Degradation**: Email features don't break core functionality
4. **Test-Driven Development**: Comprehensive test coverage ensures reliability
5. **Configuration-Driven**: Environment variables for easy deployment

The API is production-ready with comprehensive error handling, authentication, and offline-first design principles.
