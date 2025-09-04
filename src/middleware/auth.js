const jwt = require('jsonwebtoken');
const { getQuery } = require('../db/db');
const config = require('../config');

// Middleware to protect routes
const protect = async (req, res, next) => {
  // Check for Authorization header
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    // Extract token
    const token = req.headers.authorization.split(' ')[1];
    // Verify token
    const decoded = jwt.verify(token, config.JWT_SECRET);
    // Fetch user from database
    const user = await getQuery('SELECT id, username, email FROM users WHERE id = ?', [decoded.id]);
    
    // Check if user exists
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    return res.status(401).json({ message: 'Not authorized' });
  }
};

module.exports = { protect };