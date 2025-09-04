/**
 * @fileoverview Authentication routes for user management
 * @description This file handles user registration, login, password reset, and user management operations
 */

const express = require('express');
const userAuth = require('../services/userService');
const {protect}  = require('../middleware/auth')
const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Register a new user
 *     description: Create a new user account with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserRegistration'
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserCreated'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/register', async(req,res)=>{
    const {email, password, username} = req.body;
    try{
        const result = await userAuth.createUser(email, password, username);
        res.status(201).json({message: 'User created successfully', userId : result.id});
    }catch(error){
        res.status(500).json({message: 'Error creating user', error: error.message});
    }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: User login
 *     description: Authenticate user and return JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserLogin'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Invalid credentials or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await userAuth.login(email, password);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/auth/request-reset:
 *   post:
 *     tags: [Authentication]
 *     summary: Request password reset
 *     description: Send password reset email to user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordResetRequest'
 *     responses:
 *       200:
 *         description: Password reset email sent
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       400:
 *         description: Invalid email or user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/request-reset', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await userAuth.requestResetPassword(email);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Reset password with token
 *     description: Reset user password using reset token from email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordReset'
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       400:
 *         description: Invalid token or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    const result = await userAuth.forgetPassword(resetToken, newPassword);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});




/**
 * @swagger
 * /api/auth/updateUser/{id}:
 *   post:
 *     tags: [Users]
 *     summary: Update user information
 *     description: Update user email and/or password (requires authentication)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: newemail@example.com
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: newPassword123
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User updated successfully
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/updateUser/:id',protect, async(req, res)=>{
    const {id} = req.params;
    const {email , password} = req.body;
    try{
        const result = await userAuth.updateUser(id,{email,password});
        res.status(200).json({message: 'User updated successfully', user: result});
    }catch(error){
        res.status(400).json({message: 'Error updating user', error: error.message});
    }
})
/**
 * @swagger
 * /api/auth/getAllUser:
 *   post:
 *     tags: [Users]
 *     summary: Get all users
 *     description: Retrieve list of all registered users (admin function)
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User fetched successfully
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/getAllUser', async(req, res)=>{
    try{
        const result = await userAuth.getAllUser();
        res.status(200).json({message: 'User fetched successfully', users: result});
    }catch(error){
        res.status(500).json({message: 'Error fetching user', error: error.message});
    }
})
/**
 * @swagger
 * /api/auth/getUserById/{id}:
 *   post:
 *     tags: [Users]
 *     summary: Get user by ID
 *     description: Retrieve specific user information by user ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID to retrieve
 *     responses:
 *       200:
 *         description: User retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User fetched successfully
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/getUserById/:id', async(req, res)=>{
    const {id} = req.params;
    try{
        const result = await userAuth.getUserById(id);
        res.status(200).json({message: 'User fetched successfully', user: result});
    }catch(error){
        res.status(404).json({message: 'Error fetching user', error: error.message});
    }
});
/**
 * @swagger
 * /api/auth/deleteUser/{id}:
 *   post:
 *     tags: [Users]
 *     summary: Delete user account
 *     description: Soft delete user account (requires authentication)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User deleted successfully
 *                 userId:
 *                   type: string
 *                   format: uuid
 *                   example: 550e8400-e29b-41d4-a716-446655440000
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/deleteUser/:id', protect , async(req, res)=>{
    const {id} = req.params;
    try{
        const result = await userAuth.deleteUser(id);
        res.status(200).json({message: 'User deleted successfully', userId: result.id});
    }catch(error){
        res.status(400).json({message: 'Error deleting user', error: error.message});
    }
});


module.exports = router;