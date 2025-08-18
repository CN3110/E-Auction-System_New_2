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
  getLiveAuctionDetails,
  getLiveAuctionRankings,
  checkAuctionLiveStatus
} = require('../Controllers/liveAuction');

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
router.put('/:auctionId', authenticateToken, requireAdmin, updateAuction);

// Delete auction (Admin only)
router.delete('/:auctionId', authenticateToken, requireAdmin, deleteAuction);

// Get specific auction details
router.get('/:auctionId', authenticateToken, getAuction);

// ===== LIVE AUCTION ROUTES =====

// Get live auctions for bidders (only auctions they're invited to)
router.get('/live/bidder', authenticateToken, requireBidder, getLiveAuctionsForBidder);

// Get live auctions for admin (all live auctions)
//router.get('/live/admin', authenticateToken, requireAdminOrSystemAdmin, getLiveAuctionsForAdmin);

// Get specific live auction details
router.get('/live/:auctionId/details', authenticateToken, getLiveAuctionDetails);

// Get live auction rankings
router.get('/live/:auctionId/rankings', authenticateToken, getLiveAuctionRankings);

// Check auction live status
router.get('/live/:auctionId/status', authenticateToken, checkAuctionLiveStatus);

module.exports = router;

