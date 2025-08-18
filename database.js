const { Pool } = require('pg');
require('dotenv').config();

// Database connection configuration
const config = {
  connectionString: process.env.DATABASE_URL,
  // If DATABASE_URL is not set, use individual parameters
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sigalit_dev',
  user: process.env.DB_USER || 'sigalit_user',
  password: process.env.DB_PASSWORD || 'sigalit_password',
  
  // Connection pool settings
  max: 20, // maximum number of clients in the pool
  idleTimeoutMillis: 30000, // close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // return an error if connection takes longer than 2 seconds
};

// Create connection pool
const pool = new Pool(config);

// Handle connection errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Don't exit the process immediately in development
  // process.exit(-1);
});

// Database query helper function
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Query executed:', { text: text.substring(0, 50), duration, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
};

// Get a client from the pool for transactions
const getClient = async () => {
  return await pool.connect();
};

// Health check function
const healthCheck = async () => {
  try {
    const result = await query('SELECT NOW()', []);
    return {
      status: 'healthy',
      timestamp: result.rows[0].now,
      database: 'connected'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      database: 'disconnected'
    };
  }
};

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down database connection pool...');
  await pool.end();
};

// Handle process termination
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = {
  query,
  getClient,
  healthCheck,
  pool,
  shutdown
};