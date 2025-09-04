require('dotenv').config();

// Resolve JWT secret supporting both JWT_SECRET and JWT_SECRET_KEY
const jwtSecret = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;

// Validate required environment variables (allow either JWT secret env var)
const requiredEnvVars = [
  'DATABASE_URI',
  'MAIL_USERNAME',
  'MAIL_PASSWORD',
  'MAIL_SERVER',
];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
if (!jwtSecret) {
  throw new Error('Missing required environment variable: JWT_SECRET or JWT_SECRET_KEY');
}

const isTest = process.env.VITEST || process.env.NODE_ENV === 'test';

module.exports = {
  JWT_SECRET: jwtSecret,
  DB_PATH: isTest ? ':memory:' : (process.env.DATABASE_URI || './tasks.db'),
  SYNC_BATCH_SIZE: parseInt(process.env.SYNC_BATCH_SIZE, 10) || 50,
  PORT: parseInt(process.env.PORT, 10) || 3000,
  MAIL_USERNAME: process.env.MAIL_USERNAME,
  MAIL_DEFAULT_SENDER: process.env.MAIL_DEFAULT_SENDER || process.env.MAIL_USERNAME,
  MAIL_SENDER_NAME: process.env.MAIL_SENDER_NAME || 'Task Management App',
  MAIL_PASSWORD: process.env.MAIL_PASSWORD,
  MAIL_PORT: parseInt(process.env.MAIL_PORT, 10) || 465,
  MAIL_SERVER: process.env.MAIL_SERVER || 'smtp.gmail.com',
  MAIL_USE_TLS: process.env.MAIL_USE_TLS === 'true' || true, // Gmail requires TLS for port 465
};