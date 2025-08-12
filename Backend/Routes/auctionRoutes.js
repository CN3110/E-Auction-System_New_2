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
const { authenticate } = require('../Middleware/auth');

// Create auction (admin only)
router.post('/create', createAuction);

// Get all auctions for admin with filters and pagination
router.get('/', authenticateToken, getAllAuctionsAdmin);

// Get live auction for logged bidder
router.get('/bidder/live', authenticate, requireBidder, getLiveAuction);

// Get live auction for current bidder
//router.get('/live', authenticateToken, requireBidder, getLiveAuction);

// Get all auctions (admin can see all, bidders see only their invited ones)
//router.get('/', authenticateToken, getAllAuctions);

// Get specific auction details
router.get('/:auctionId', authenticateToken, getAuction);

// Get live rankings for an auction
//router.get('/:auctionId/rankings', authenticateToken, getLiveRankings);

// Get minimum bid amount
//router.get('/:auctionId/min-bid', authenticateToken, async (req, res) => {
  /*try {
    const { auctionId } = req.params;
    
    // Get the current lowest bid for this auction
    const { data: lowestBid, error } = await supabaseAdmin
      .from('bids')
      .select('amount')
      .eq('auction_id', auctionId)
      .order('amount', { ascending: true })
      .limit(1)
      .single();
    
    if (error) throw error;
    
    // Calculate minimum bid (current lowest - 1)
    const minBid = lowestBid ? (lowestBid.amount - 1) : 0;
    
    res.json({ success: true, minBid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});*/

module.exports = router;