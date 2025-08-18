const express = require('express');
const db = require('./database');

const app = express();
const PORT = 4000;

app.use(express.json());

// Simple test endpoint
app.get('/test', async (req, res) => {
  try {
    console.log('Test endpoint called');
    const result = await db.query('SELECT 1 as test');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    console.log('Health check called');
    const health = await db.healthCheck();
    res.json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
});

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});