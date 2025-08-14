// Create this as a new file: Backend/Utils/scheduler.js
const cron = require('node-cron');
const { updateAuctionStatuses } = require('../Controllers/auctionController');

/**
 * Initialize the auction status update scheduler
 * Runs every minute to check and update auction statuses
 */
const initializeScheduler = () => {
  console.log('Initializing auction status scheduler...');
  
  // Run every minute (0 * * * * *) to check for status updates
  cron.schedule('* * * * *', async () => {
    try {
      console.log('Running scheduled auction status update...');
      await updateAuctionStatuses();
    } catch (error) {
      console.error('Error in scheduled auction status update:', error);
    }
  });
  
  console.log('Auction status scheduler initialized - will run every minute');
  
  // Also run immediately on startup
  setTimeout(async () => {
    try {
      console.log('Running initial auction status update...');
      await updateAuctionStatuses();
    } catch (error) {
      console.error('Error in initial auction status update:', error);
    }
  }, 5000); // Wait 5 seconds after startup
};

module.exports = {
  initializeScheduler
};

// Add this to your main server.js file:
/*
const { initializeScheduler } = require('./Utils/scheduler');

// Initialize the scheduler after your app setup
initializeScheduler();
*/