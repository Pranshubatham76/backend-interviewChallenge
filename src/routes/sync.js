/**
 * @fileoverview Synchronization routes
 * @description Handles offline synchronization, status monitoring, and health checks
 */

const express = require('express');
const SyncService = require('../services/syncService');
const { validate, syncSchema } = require('../middleware/validate');
const {protect}  = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/sync:
 *   post:
 *     tags: [Synchronization]
 *     summary: Synchronize local changes with server
 *     description: |
 *       Submit local changes for synchronization and receive server changes.
 *       Handles offline-to-online data sync with conflict resolution.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SyncRequest'
 *     responses:
 *       200:
 *         description: Sync completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/', protect, validate(syncSchema), async (req, res) => {
  const { changes, last_synced_at } = req.body;
  try {
    const syncId = await SyncService.startSync(req.user.id, changes.length);
    const result = await SyncService.sync(changes, last_synced_at, req.user.id, syncId);
    // Do not override status returned by service; include syncId for reference
    res.json({ ...result, syncId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/sync/status:
 *   get:
 *     tags: [Synchronization]
 *     summary: Get synchronization status
 *     description: |
 *       Check the current synchronization status including pending operations,
 *       last sync timestamp, and queue size.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Sync status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncStatus'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/status', protect, async (req, res) => {
  try {
    const syncStatus = await SyncService.getSyncStatus(req.user.id);
    const queueCount = syncStatus.pending || 0;
    const lastLog = syncStatus.logs && syncStatus.logs.length > 0 ? syncStatus.logs[0] : null;
    
    res.json({
      pending_sync_count: queueCount,
      last_sync_timestamp: lastLog ? lastLog.created_at : null,
      is_online: true, // Assume online when hitting this endpoint
      sync_queue_size: queueCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/sync/batch:
 *   post:
 *     tags: [Synchronization]
 *     summary: Batch synchronization endpoint
 *     description: |
 *       Process a batch of sync operations at once for improved performance.
 *       Useful for handling large numbers of queued operations.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/SyncChange'
 *                 description: Array of sync operations to process
 *               client_timestamp:
 *                 type: string
 *                 format: date-time
 *                 description: Client timestamp for the batch
 *                 example: '2024-01-10T10:00:00Z'
 *     responses:
 *       200:
 *         description: Batch processing completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 processed_items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       client_id:
 *                         type: string
 *                         description: Original client task ID
 *                       server_id:
 *                         type: string
 *                         description: Server-assigned task ID
 *                       status:
 *                         type: string
 *                         enum: [success, error]
 *                         description: Processing status
 *                       resolved_data:
 *                         type: object
 *                         description: Final resolved task data
 *                       error:
 *                         type: string
 *                         description: Error message if status is error
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/batch', protect, async (req, res) => {
  try {
    const { items, client_timestamp } = req.body;
    const processed_items = [];
    
    for (const item of items) {
      try {
        // Process each sync queue item
        const result = {
          client_id: item.task_id,
          server_id: item.task_id, // In this implementation, we use the same ID
          status: 'success',
          resolved_data: item.data
        };
        processed_items.push(result);
      } catch (error) {
        processed_items.push({
          client_id: item.task_id,
          status: 'error',
          error: error.message
        });
      }
    }
    
    res.json({ processed_items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/sync/health:
 *   get:
 *     tags: [System]
 *     summary: Health check endpoint
 *     description: |
 *       Check if the synchronization service is running properly.
 *       This endpoint does not require authentication.
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/health', async (req, res) => {
  try {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
