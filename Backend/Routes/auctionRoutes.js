// Backend/Routes/auctionRoutes.js
const express = require('express');
const router = express.Router();

// Import auction controllers
const { 
  createAuction,
  getAllAuctions,
  getAuction,
  getAllAuctionsAdmin,
  updateAuction,
  deleteAuction,
  approveAuction,
  rejectAuction
} = require('../Controllers/auctionController');

// Import live auction controllers
const {
  getLiveAuctionsForBidder,
  getLiveAuctionsForAdmin,
  getLiveAuctionDetails,
  getLiveAuctionRankings,
  checkAuctionLiveStatus,
  getAuctionStatistics,
  getActivelyParticipatingBidders
} = require('../Controllers/liveAuction');

// Import results controllers
const { 
  shortlistTopBidders,        // NEW
  awardBidder, 
  markBidderNotAwarded,       // NEW
  disqualifyBidder,  
  cancelAuction,              // NEW
  getAllAuctionBids, 
  getTopBidders,
  getAuctionResultsOverview,
  getBidderAuctionResults
} = require('../Controllers/results');

// Import middleware
const { 
  authenticateToken, 
  requireAdmin, 
  requireBidder, 
  requireSystemAdmin,
  requireAdminOrSystemAdmin 
} = require('../Middleware/auth');

// ===== AUCTION MANAGEMENT ROUTES =====

// Create auction (admin only)
router.post('/create', authenticateToken, requireAdmin, createAuction);

// Get all auctions for admin with filters and pagination
router.get('/admin/all', authenticateToken, requireAdminOrSystemAdmin, getAllAuctionsAdmin);

// Get all auctions (role-based filtering)
router.get('/all', authenticateToken, getAllAuctions);

// Approval endpoints (System Admin only)
router.post('/:auctionId/approve', authenticateToken, requireSystemAdmin, approveAuction);
router.post('/:auctionId/reject', authenticateToken, requireSystemAdmin, rejectAuction);

// Update auction details (Admin only)
router.put('/:auctionId', authenticateToken, requireAdminOrSystemAdmin, updateAuction);

// Delete auction (Admin only)
router.delete('/:auctionId', authenticateToken, requireAdminOrSystemAdmin, deleteAuction);

// Get specific auction details
router.get('/:auctionId', authenticateToken, getAuction);

// ===== LIVE AUCTION ROUTES =====

// Get live auctions for bidders (only auctions they're invited to)
router.get('/live/bidder', authenticateToken, requireBidder, getLiveAuctionsForBidder);

// Get live auctions for admin (all live auctions)
router.get('/live/admin', authenticateToken, requireAdminOrSystemAdmin, getLiveAuctionsForAdmin);

// Get specific live auction details
router.get('/live/:auctionId/details', authenticateToken, getLiveAuctionDetails);

// Get live auction rankings
router.get('/live/:auctionId/rankings', authenticateToken, getLiveAuctionRankings);

// Check auction live status
router.get('/live/:auctionId/status', authenticateToken, checkAuctionLiveStatus);

// ===== STATISTICS ROUTES =====

// Get detailed auction statistics (Admin only)
router.get('/:auctionId/statistics', authenticateToken, requireAdminOrSystemAdmin, getAuctionStatistics);

// Get actively participating bidders for an auction (Admin only)
router.get('/:auctionId/active-bidders', authenticateToken, requireAdminOrSystemAdmin, getActivelyParticipatingBidders);

// ===== RESULTS MANAGEMENT ROUTES =====

// Get top 5 bidders
router.get('/:auctionId/top-bidders', authenticateToken, getTopBidders);

// Get all bid records for an auction
router.get('/:auctionId/all-bids', authenticateToken, getAllAuctionBids);

// ===== NEW SHORTLISTING & RESULTS ROUTES =====

// Shortlist top 5 bidders (System Admin only) - NEW
router.post('/:auctionId/shortlist', authenticateToken, requireSystemAdmin, shortlistTopBidders);

// Award bidder (System Admin only) - UPDATED
router.post('/:auctionId/award/:bidderId', authenticateToken, requireSystemAdmin, awardBidder);

// Mark bidder as not awarded (System Admin only) - NEW
router.post('/:auctionId/not-award/:bidderId', authenticateToken, requireSystemAdmin, markBidderNotAwarded);

// Disqualify bidder (System Admin only) - UPDATED
router.post('/:auctionId/disqualify/:bidderId', authenticateToken, requireSystemAdmin, disqualifyBidder);

// Cancel auction (System Admin only) - NEW
router.post('/:auctionId/cancel', authenticateToken, requireSystemAdmin, cancelAuction);

// ===== RESULTS VIEWING ROUTES =====

// Get auction results overview for admin dashboard
router.get('/results/overview', authenticateToken, requireAdminOrSystemAdmin, getAuctionResultsOverview);

// Get bidder's auction results - UPDATED endpoint
router.get('/results/bidder/results', authenticateToken, requireBidder, getBidderAuctionResults);

module.exports = router;