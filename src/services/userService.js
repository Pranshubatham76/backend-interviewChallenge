const {v4 : uuidv4} = require('uuid');
const {runQuery, getQuery, allQuery} = require('../db/db');
const bcrypt = require('bcryptjs');
const generateToken = require('../utils/generateToken');
const config = require('../config')
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: config.MAIL_SERVER,
  port: config.MAIL_PORT,
  secure: config.MAIL_USE_TLS,
  auth: {
    user: config.MAIL_USERNAME,
    pass: config.MAIL_PASSWORD,
  },
});


// get User
const getUser = async()=>{
    try{
        const sql = 'SELECT id, email, username, created_at FROM users WHERE is_deleted=0';
        const users = await allQuery(sql);
        return users;
    }catch(error){
        throw new Error(`Failed to fetch users : ${error.message}`);
    }
};

// get User by Id
const getUserById = async (id)=>{
    if(!id) throw new Error('User ID is required');

    try{
        const sql = 'SELECT id, email, username, created_at FROM users WHERE id = ? AND is_deleted = 0';
        const user = await getQuery(sql, [id]);
        if(!user) throw new Error('User not found');
        return user;
    }catch(error){
        throw new Error(`Failed to fetch user : ${error.message}`);
    }
};

// create user
const createUser = async (email, password, username = null)=>{
    if(!email || !password) throw new Error('Email and password are required');

    const existUser = await getQuery('SELECT id FROM users WHERE email = ? AND is_deleted = 0', [email]);
    if(existUser) throw new Error('User already exists');

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const created_at = new Date().toISOString();
    const sql = 'INSERT INTO users (id, email, password, username, created_at) VALUES (?, ?, ?, ?, ?)';
    try{
        await runQuery(sql, [id, email, hashedPassword, username, created_at]);
        return {id, email, username, created_at};
    }catch(error){
        if(error.message.includes('UNIQUE constraint failed')){
            throw new Error('Email already exists');
        }
        throw new Error(`Failed to create user : ${error.message}`);
    }
};

// update user
const updateUser = async (id , updates)=>{
    if(!id) throw new Error('User ID is required');
    if(!updates || typeof updates !== 'object' ) throw new Error('Updates are required');

    const user = await getUserById(id);
    if(!user) throw new Error('User not found');

    const {email, password, username} = updates;
    const fields = [];
    const params = [];

    if(email){
        const emailExists = await getQuery('SELECT id FROM users WHERE email = ? AND id != ? AND is_deleted = 0', [email, id]);
        if(emailExists) throw new Error('Email already exists');
        fields.push('email = ?');
        params.push(email);
    }

    if(password){
        const hashedPassword = await bcrypt.hash(password, 10);
        fields.push('password = ?');
        params.push(hashedPassword);
    }

    if(username !== undefined){
        fields.push('username = ?');
        params.push(username);
    }

    if(fields.length === 0) throw new Error('No valid fields to update');
    params.push(id);

    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    try{
        await runQuery(sql, params);
        const updatedUser = await getUserById(id);
        return updatedUser;
    }catch(error){
        if(error.message.includes('UNIQUE constraint failed')){
            throw new Error('Email already exist');
        }

        throw new Error(`Failed to update user : ${error.message}`);
    }
};

// delete User 
const deleteUser = async (id)=>{
    if(!id) throw new Error('User ID is required');

    // Check if user exists first
    const user = await getQuery('SELECT id FROM users WHERE id = ? AND is_deleted = 0', [id]);
    if(!user) throw new Error('User not found');

    // soft delete 
    const sql = 'UPDATE users SET is_deleted = 1 WHERE id = ? AND is_deleted = 0';
    try{
        const result = await runQuery(sql, [id]);
        if(result.changes === 0) throw new Error('User not found or already deleted');
        return { id, message: 'User deleted successfully' };
    }catch(error){
        throw new Error(`Failed to delete user : ${error.message}`);
    }
};

// Login user and return JWT token
const login = async (email, password) => {
  // Validate input
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  // Find user by email
  const user = await getQuery('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Verify password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  // Generate JWT token
  const token = generateToken(user.id);

  //  send email to the user with the token -> May user forget their token
  const mailData =  {
    from : `"${config.MAIL_SENDER_NAME}" <${config.MAIL_DEFAULT_SENDER}>`,
    to : email,
    subject : 'Login Successful',
    html : `
      <p>You have successfully logged in to your Task Management account.</p>
      <p>Use this token: <strong>${token}</strong></p>
    `,
  }

  // Skip email sending during tests
  if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
    try {
      await transporter.sendMail(mailData);
    } catch (error) {
      console.error('Error sending email:', error);
    }
  }
  
  // Return user data and token through CLI
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    token
  };
};

// Request password reset (send reset token via email)
const requestResetPassword = async (email) => {
  // Validate input
  if (!email) {
    throw new Error('Email is required');
  }

  // Find user by email
  const user = await getQuery('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    throw new Error('User not found');
  }

  // Generate reset token and expiration
  const resetToken = uuidv4();
  const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour expiry

  // Store reset token and expiration in database
  await runQuery(
    'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
    [resetToken, expires, user.id]
  );

  // email sending 
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
    `,
  };

  // Skip email sending during tests
  if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }
  }
  
  return { message: 'Password reset email sent' };
  
};

// Reset password using token
const forgetPassword = async (resetToken, newPassword) => {
  // Validate input
  if (!resetToken || !newPassword) {
    throw new Error('Reset token and new password are required');
  }

  // Find user by reset token
  const user = await getQuery(
    'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?',
    [resetToken, new Date().toISOString()]
  );
  if (!user) {
    throw new Error('Invalid or expired reset token');
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  // Update password and clear reset token
  await runQuery(
    'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
    [hashedPassword, user.id]
  );

  return { message: 'Password reset successful' };
};

module.exports = {
  // user CRUD
  getUser,
  getAllUser: getUser,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  // auth
  login,
  requestResetPassword,
  forgetPassword,
};
