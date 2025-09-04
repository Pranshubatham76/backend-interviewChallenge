const jwt = require('jsonwebtoken');
const config = require('../config');

const generateToken = (id) => {
  // Validate input
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid user ID');
  }
  
  // Sign token with user ID
  return jwt.sign({ id }, config.JWT_SECRET, {
    expiresIn: '1h',
  });
};

module.exports = generateToken;