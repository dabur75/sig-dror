// Simple wrapper to catch any errors
try {
  console.log('Starting Sigalit PostgreSQL app...');
  require('./app.js');
} catch (error) {
  console.error('Error starting app:', error);
  process.exit(1);
}

// Keep process alive
setInterval(() => {
  // Keep alive
}, 60000);