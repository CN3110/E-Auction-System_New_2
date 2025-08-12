const express = require('express');
const app = express();

// Import routes
const authRoutes = require('./Routes/auth');
const adminRoutes = require('./Routes/admin');
const auctionRoutes = require('./Routes/auction');
const bidderRoutes = require('./Routes/bidder');

// Middleware
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auction', auctionRoutes);
app.use('/api/bidder', bidderRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

module.exports = app;