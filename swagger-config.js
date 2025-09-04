const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Task Management API',
      version: '1.0.0',
      description: 'Offline-first Task Management API with synchronization capabilities',
      contact: {
        name: 'Task Management API Support',
        email: 'support@taskmanagement.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.taskmanagement.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authentication'
        }
      },
      schemas: {
        User: {
          type: 'object',
          required: ['id', 'email'],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique user identifier',
              example: '550e8400-e29b-41d4-a716-446655440000'
            },
            username: {
              type: 'string',
              description: 'User display name (optional)',
              example: 'john_doe'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'user@example.com'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'User creation timestamp',
              example: '2024-01-10T10:00:00Z'
            }
          }
        },
        Task: {
          type: 'object',
          required: ['id', 'title', 'completed', 'created_at', 'updated_at'],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique task identifier',
              example: '550e8400-e29b-41d4-a716-446655440001'
            },
            title: {
              type: 'string',
              minLength: 1,
              maxLength: 255,
              description: 'Task title',
              example: 'Complete project documentation'
            },
            description: {
              type: 'string',
              description: 'Task description (optional)',
              example: 'Write comprehensive docs for the new API'
            },
            completed: {
              type: 'boolean',
              description: 'Task completion status',
              example: false
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Task creation timestamp',
              example: '2024-01-10T10:00:00Z'
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'Task last update timestamp',
              example: '2024-01-10T10:00:00Z'
            },
            is_deleted: {
              type: 'boolean',
              description: 'Soft delete flag',
              example: false
            },
            sync_status: {
              type: 'string',
              enum: ['pending', 'synced', 'error'],
              description: 'Synchronization status',
              example: 'pending'
            },
            server_id: {
              type: 'string',
              description: 'Server-assigned ID (null for unsynced tasks)',
              example: null
            },
            last_synced_at: {
              type: 'string',
              format: 'date-time',
              description: 'Last synchronization timestamp',
              example: null
            }
          }
        },
        TaskInput: {
          type: 'object',
          required: ['title'],
          properties: {
            title: {
              type: 'string',
              minLength: 1,
              maxLength: 255,
              description: 'Task title',
              example: 'Complete project documentation'
            },
            description: {
              type: 'string',
              description: 'Task description (optional)',
              example: 'Write comprehensive docs for the new API'
            }
          }
        },
        TaskUpdate: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              minLength: 1,
              maxLength: 255,
              description: 'Task title',
              example: 'Updated task title'
            },
            description: {
              type: 'string',
              description: 'Task description',
              example: 'Updated task description'
            },
            completed: {
              type: 'boolean',
              description: 'Task completion status',
              example: true
            }
          }
        },
        UserRegistration: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'user@example.com'
            },
            password: {
              type: 'string',
              minLength: 6,
              description: 'User password (minimum 6 characters)',
              example: 'securepassword123'
            },
            username: {
              type: 'string',
              description: 'User display name (optional)',
              example: 'john_doe'
            }
          }
        },
        UserLogin: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'user@example.com'
            },
            password: {
              type: 'string',
              description: 'User password',
              example: 'securepassword123'
            }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'User ID',
              example: '550e8400-e29b-41d4-a716-446655440000'
            },
            username: {
              type: 'string',
              description: 'User display name',
              example: 'john_doe'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email',
              example: 'user@example.com'
            },
            token: {
              type: 'string',
              description: 'JWT authentication token',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
            }
          }
        },
        PasswordResetRequest: {
          type: 'object',
          required: ['email'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address for password reset',
              example: 'user@example.com'
            }
          }
        },
        PasswordReset: {
          type: 'object',
          required: ['resetToken', 'newPassword'],
          properties: {
            resetToken: {
              type: 'string',
              format: 'uuid',
              description: 'Password reset token received via email',
              example: 'reset-uuid-123456'
            },
            newPassword: {
              type: 'string',
              minLength: 6,
              description: 'New password (minimum 6 characters)',
              example: 'newSecurePassword456'
            }
          }
        },
        SyncChange: {
          type: 'object',
          required: ['operation', 'local_id', 'data'],
          properties: {
            operation: {
              type: 'string',
              enum: ['create', 'update', 'delete'],
              description: 'Type of operation performed',
              example: 'create'
            },
            local_id: {
              type: 'string',
              description: 'Local task identifier',
              example: 'client-task-123'
            },
            data: {
              type: 'object',
              description: 'Task data for the operation',
              example: {
                title: 'New task from client',
                description: 'Task created offline',
                completed: false
              }
            }
          }
        },
        SyncRequest: {
          type: 'object',
          required: ['changes'],
          properties: {
            changes: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/SyncChange'
              },
              description: 'Array of changes to synchronize',
              example: [
                {
                  operation: 'create',
                  local_id: 'client-task-1',
                  data: {
                    title: 'New client task',
                    description: 'Created on client',
                    completed: false
                  }
                }
              ]
            },
            last_synced_at: {
              type: 'string',
              format: 'date-time',
              description: 'Last synchronization timestamp',
              example: '2024-01-10T09:00:00Z'
            }
          }
        },
        SyncMapping: {
          type: 'object',
          properties: {
            local_id: {
              type: 'string',
              description: 'Local task identifier',
              example: 'client-task-1'
            },
            server_id: {
              type: 'string',
              format: 'uuid',
              description: 'Server-assigned task identifier',
              example: 'server-task-uuid-789'
            }
          }
        },
        SyncConflict: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'Task identifier with conflict',
              example: 'task-uuid-123'
            },
            local_data: {
              type: 'object',
              description: 'Local version of the data'
            },
            server_data: {
              type: 'object',
              description: 'Server version of the data'
            },
            resolution: {
              type: 'string',
              enum: ['local_wins', 'server_wins'],
              description: 'How the conflict was resolved',
              example: 'local_wins'
            }
          }
        },
        SyncResponse: {
          type: 'object',
          properties: {
            mappings: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/SyncMapping'
              },
              description: 'Mapping from local IDs to server IDs'
            },
            conflicts: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/SyncConflict'
              },
              description: 'Conflicts encountered during sync'
            },
            serverChanges: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Task'
              },
              description: 'Changes from server to apply locally'
            },
            status: {
              type: 'string',
              enum: ['completed', 'partial', 'error'],
              description: 'Overall sync status',
              example: 'completed'
            },
            processed: {
              type: 'integer',
              description: 'Number of changes successfully processed',
              example: 5
            },
            failed: {
              type: 'integer',
              description: 'Number of changes that failed',
              example: 0
            },
            syncId: {
              type: 'string',
              format: 'uuid',
              description: 'Unique sync operation identifier',
              example: 'sync-uuid-456'
            }
          }
        },
        SyncStatus: {
          type: 'object',
          properties: {
            pending_sync_count: {
              type: 'integer',
              description: 'Number of pending sync operations',
              example: 3
            },
            last_sync_timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Timestamp of last successful sync',
              example: '2024-01-10T10:00:00Z'
            },
            is_online: {
              type: 'boolean',
              description: 'Current online status',
              example: true
            },
            sync_queue_size: {
              type: 'integer',
              description: 'Current sync queue size',
              example: 3
            }
          }
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['ok', 'error'],
              description: 'Service health status',
              example: 'ok'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Health check timestamp',
              example: '2024-01-10T11:30:00Z'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              oneOf: [
                {
                  type: 'string',
                  description: 'Single error message'
                },
                {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Multiple validation error messages'
                }
              ],
              example: 'Task not found'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Error timestamp',
              example: '2024-01-10T11:30:00Z'
            },
            path: {
              type: 'string',
              description: 'API endpoint that generated the error',
              example: '/api/tasks/invalid-id'
            }
          }
        },
        AuthError: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Authentication error message',
              example: 'Invalid token'
            }
          }
        },
        SuccessMessage: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Success message',
              example: 'Operation completed successfully'
            }
          }
        },
        UserCreated: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Success message',
              example: 'User created successfully'
            },
            userId: {
              type: 'string',
              format: 'uuid',
              description: 'Created user ID',
              example: '550e8400-e29b-41d4-a716-446655440000'
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication token is missing or invalid',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/AuthError'
              }
            }
          }
        },
        ValidationError: {
          description: 'Input validation failed',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and account management operations'
      },
      {
        name: 'Tasks',
        description: 'Task management operations'
      },
      {
        name: 'Synchronization',
        description: 'Offline synchronization operations'
      },
      {
        name: 'Users',
        description: 'User management operations'
      },
      {
        name: 'System',
        description: 'System health and monitoring'
      }
    ]
  },
  apis: [
    path.join(__dirname, 'src/routes/tasks.js'),
    path.join(__dirname, 'src/routes/userAuth.js'),
    path.join(__dirname, 'src/routes/sync.js'),
    path.join(__dirname, 'src/server.js')
  ]
};

const specs = swaggerJSDoc(options);

module.exports = {
  specs,
  swaggerUi,
  swaggerSetup: swaggerUi.setup(specs, {
    explorer: true,
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .scheme-container { background: #fff; }
      .swagger-ui .info { margin: 50px 0; }
      .swagger-ui .info .title { color: #3b4151; }
    `,
    customSiteTitle: 'Task Management API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayOperationId: false,
      filter: true,
      showRequestHeaders: true,
      tryItOutEnabled: true,
      docExpansion: 'list',
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2,
      displayRequestDuration: true,
      operationsSorter: 'alpha',
      tagsSorter: 'alpha',
      supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
      validatorUrl: null,
      oauth2RedirectUrl: undefined,
      showCommonExtensions: true,
      showExtensions: true
    }
  })
};
