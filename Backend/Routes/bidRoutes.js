const express = require('express');
const router = express.Router();
const { 
  placeBid,
  getLatestBid,
  getBidderRank,
  
  getAuctionBids,
  getBidderHistory
} = require('../Controllers/bidController');
const { authenticate, authorizeRoles, authenticateToken, requireAdminOrSystemAdmin} = require('../Middleware/auth');

// Place a new bid (bidders only) - FIXED: Added proper auth
router.post('/', authenticate, authorizeRoles('bidder'), placeBid);

// Get latest bid for current bidder in a specific auction - FIXED: Added auth
router.get('/latest', authenticate, authorizeRoles('bidder'), getLatestBid);

// Get bidder's rank in a specific auction - FIXED: Added auth
router.get('/rank', authenticate, authorizeRoles('bidder'), getBidderRank);

// Get minimum bid amount to lead - FIXED: Added auth
//router.get('/min-amount', authenticate, authorizeRoles('bidder'), getMinBidAmount);

// Get all bids for an auction (admin only) - FIXED: Added proper auth
router.get('/auction/:auctionId', authenticateToken, requireAdminOrSystemAdmin, getAuctionBids);

// Get bidder's auction history - FIXED: Added auth
router.get('/history', authenticate, authorizeRoles('bidder'), getBidderHistory);

module.exports = router;