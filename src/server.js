const express = require('express');
const dotenv = require('dotenv');
const config = require('./config');
const db = require('./db/db')
const bodyParser = require('body-parser');
const { specs, swaggerUi, swaggerSetup } = require('../swagger-config');

dotenv.config();

const app = express();

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(bodyParser.json());
app.use(express.urlencoded({extended: false}));

// Mount API routes
const taskRoutes = require('./routes/tasks');
const syncRoutes = require('./routes/sync');
const authRoutes = require('./routes/userAuth');

app.use('/api/tasks', taskRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root redirect to API docs
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

// Swagger UI setup with error handling
try {
  // Serve Swagger JSON specification
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
  
  // Setup Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
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
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      displayRequestDuration: true,
      operationsSorter: 'alpha',
      tagsSorter: 'alpha'
    }
  }));
  
  console.log('Swagger UI configured successfully at /api-docs');
} catch (error) {
  console.error('Error setting up Swagger UI:', error.message);
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString(),
    path: req.path
  });
});

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  });
});

const server = app.listen(config.PORT, () => {
    console.log(`Server is running on port ${config.PORT}`);
    console.log(`Swagger UI available at http://localhost:${config.PORT}/api-docs`);
    console.log(`API Documentation JSON at http://localhost:${config.PORT}/api-docs.json`);
});

// Export both app and server for testing
module.exports = { app, server };
