const express = require('express');
const router = express.Router();
const { 
  createAuction,
  getLiveAuction,
  getAllAuctions,
  getAuction,
  getLiveRankings,
  getAllAuctionsAdmin,
} = require('../Controllers/auctionController');
const { authenticateToken, requireAdmin, requireBidder } = require('../Middleware/auth');

// Create auction (admin only) - FIXED: Added proper authentication
router.post('/create', authenticateToken, requireAdmin, createAuction);

// Get all auctions for admin with filters and pagination
router.get('/', authenticateToken, getAllAuctionsAdmin);

// Get live auction for logged bidder
router.get('/bidder/live', authenticateToken, requireBidder, getLiveAuction);

// Get specific auction details
router.get('/:auctionId', authenticateToken, getAuction);

// Get live rankings for an auction
router.get('/:auctionId/rankings', authenticateToken, getLiveRankings);

module.exports = router;