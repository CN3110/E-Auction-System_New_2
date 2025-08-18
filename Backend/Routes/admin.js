const express = require('express');
const router = express.Router();
const { registerBidder, getBidders, updateBidderStatus, getActiveBidders, testDbConnection, deactivateBidder, reactivateBidder} = require('../Controllers/adminController');
const { 
  getLiveAuctionsForAdmin,
  
} = require('../Controllers/liveAuction');
const auth = require('../Middleware/auth');
// Import middleware
const { 
  authenticateToken, 
  requireAdmin, 
  requireBidder, 
  requireSystemAdmin,
  requireAdminOrSystemAdmin 
} = require('../Middleware/auth');

// Bidder management routes
router.post('/bidders', registerBidder);
router.get('/bidders', getBidders);
router.patch('/bidders/:bidderId/status', updateBidderStatus);
router.get('/bidders/active', getActiveBidders); //het only active bidders

// Soft Delete Route (recommended approach)
router.patch('/bidders/:bidderId/deactivate', deactivateBidder);
router.patch('/bidders/:bidderId/reactivate', reactivateBidder);


// Get live auctions for admin dashboard
router.get('/live/admin', authenticateToken, requireAdminOrSystemAdmin, getLiveAuctionsForAdmin);


// Get live rankings for specific auction
//router.get('/auctions/:auctionId/rankings', getAdminAuctionRankings);

// Get overall auction results
//router.get('/auctions/results', getAuctionResults); 


router.get('/test-db', testDbConnection);


module.exports = router;