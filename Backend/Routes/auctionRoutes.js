const express = require('express');
const router = express.Router();
const { 
  createAuction,
  getLiveAuction,
  getAllAuctions,
  getAuction,
  getLiveRankings,
  getAllAuctionsAdmin,
  updateAuction,
  deleteAuction,
  getAuctionStatistics,
  getAdminAuctionRankings,
  approveAuction,
  rejectAuction
} = require('../Controllers/auctionController');
const { 
  authenticateToken, 
  requireAdmin, 
  requireBidder, 
  requireSystemAdmin,
  requireAdminOrSystemAdmin 
} = require('../Middleware/auth');

// Create auction (admin only) - FIXED: Added proper authentication
router.post('/create', authenticateToken, requireAdmin, createAuction);

// Get all auctions for admin with filters and pagination
router.get('/', authenticateToken, requireAdminOrSystemAdmin, getAllAuctionsAdmin);

// Get live auction for logged bidder
router.get('/bidder/live', authenticateToken, requireBidder, getLiveAuction);

// Approval endpoints (System Admin only)
router.post('/:auctionId/approve', authenticateToken, requireSystemAdmin, approveAuction);
router.post('/:auctionId/reject', authenticateToken, requireSystemAdmin, rejectAuction);

// Get specific auction details
router.get('/:auctionId', authenticateToken, getAuction);

// Get live rankings for an auction
router.get('/:auctionId/rankings', authenticateToken, getLiveRankings);

/**
 * Update auction details (Admin only)
 * PUT /api/auction/:auctionId
 */
router.put('/:auctionId', authenticateToken, requireAdmin, updateAuction);

/**
 * Delete auction (Admin only)
 * DELETE /api/auction/:auctionId
 */
router.delete('/:auctionId', authenticateToken, requireAdmin, deleteAuction);

/**
 * Get auction statistics (Admin only)
 * GET /api/auction/:auctionId/statistics
 */
router.get('/:auctionId/statistics', authenticateToken, requireAdmin, getAuctionStatistics);

/**
 * Get admin auction rankings (for detailed view)
 * GET /api/auction/:auctionId/admin-rankings
 */
router.get('/:auctionId/admin-rankings', authenticateToken, requireAdminOrSystemAdmin, getAdminAuctionRankings);

module.exports = router;