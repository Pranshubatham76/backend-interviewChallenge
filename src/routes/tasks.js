/**
 * @fileoverview Task management routes
 * @description Handles CRUD operations for tasks with authentication and synchronization support
 */

const express = require('express');
const TaskService = require('../services/taskService');
const { protect } = require('../middleware/auth');
const { validate, taskSchema } = require('../middleware/validate');

// Create an router instance 
const router = express.Router();

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: Get all tasks
 *     description: Retrieve all tasks for the authenticated user (excluding soft-deleted)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tasks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/', protect, async(req,res)=>{
    try{
        // get the tasks
        const tasks = await TaskService.getAllTasks(req.user.id);
        res.json(tasks);
    }catch(err){
        res.status(500).json({error : err.message});
    }
});

/**
 * @swagger
 * /api/tasks/{id}:
 *   get:
 *     tags: [Tasks]
 *     summary: Get task by ID
 *     description: Retrieve a specific task by its ID for the authenticated user
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Task ID to retrieve
 *         example: 550e8400-e29b-41d4-a716-446655440001
 *     responses:
 *       200:
 *         description: Task retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/:id', protect, async(req,res)=>{
    try{
        const task_by_id = await TaskService.getTaskById(req.params.id, req.user.id);
        if(!task_by_id) {
            return res.status(404).json({
                error: "Task not found",
                timestamp: new Date().toISOString(),
                path: `/api/tasks/${req.params.id}`
            });
        }
        res.json(task_by_id);
    }catch(error){
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString(),
            path: `/api/tasks/${req.params.id}`
        });
    }
});

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a new task
 *     description: Create a new task for the authenticated user
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaskInput'
 *     responses:
 *       201:
 *         description: Task created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/', protect, validate(taskSchema), async(req,res)=>{
    try{
        // Get the data from request body
        const { title, description, completed } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });
        try{
            const task = await TaskService.createTask(
                { title, description, completed }, req.user.id
            );
            res.status(201).json(task);

        }catch(error){
            res.status(500).json({message: error.message});
        }
    }catch(error){
        res.status(500).json({message: error.message});
    }
});

/**
 * @swagger
 * /api/tasks/{id}:
 *   put:
 *     tags: [Tasks]
 *     summary: Update an existing task
 *     description: Update task properties (supports partial updates)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Task ID to update
 *         example: 550e8400-e29b-41d4-a716-446655440001
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaskUpdate'
 *     responses:
 *       200:
 *         description: Task updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put('/:id', protect,  async(req, res)=>{
    const { title, description, completed } = req.body;
  try {
    const updatedTask = await TaskService.updateTask(req.params.id, { title, description, completed }, req.user.id);
    if (!updatedTask) return res.status(404).json({ error: 'Task not found' });
    res.json(updatedTask);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/tasks/{id}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a task
 *     description: Soft delete a task (marks as deleted but preserves data)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Task ID to delete
 *         example: 550e8400-e29b-41d4-a716-446655440001
 *     responses:
 *       204:
 *         description: Task deleted successfully (no content)
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete('/:id', protect, async(req, res)=>{
  try {
    const ok = await TaskService.deleteTask(req.params.id, req.user.id);
    if (!ok) {
        return res.status(404).json({
            error: 'Task not found',
            timestamp: new Date().toISOString(),
            path: `/api/tasks/${req.params.id}`
        });
    }
    res.status(204).send(); // 204 No Content as per API spec
  } catch (err) {
    res.status(500).json({ 
        error: err.message,
        timestamp: new Date().toISOString(),
        path: `/api/tasks/${req.params.id}`
    });
  }
});

module.exports = router;
