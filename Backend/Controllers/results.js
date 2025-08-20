const db = require('../Config/database');
const moment = require('moment-timezone');




const awardBidder = async (req, res) => {
  const { auctionId, bidderId } = req.params;
  
  // Use the transaction helper from your database config
  const result = await db.transaction(async (connection) => {
    // 1. Validate auction exists - FIXED: use id instead of auction_id
    const [auctionRows] = await connection.execute(
      'SELECT * FROM auctions WHERE id = ?', 
      [auctionId]
    );
    
    if (auctionRows.length === 0) {
      throw new Error('Auction not found');
    }

    // 2. Set awarded bidder
    await connection.execute(
      `INSERT INTO auction_results (id, auction_id, bidder_id, status) 
       VALUES (UUID(), ?, ?, 'awarded') 
       ON DUPLICATE KEY UPDATE status = 'awarded', updated_at = NOW()`,
      [auctionId, bidderId]
    );

    // 3. Set all other bidders as not awarded
    // More efficient approach using a single query
    await connection.execute(
      `INSERT INTO auction_results (id, auction_id, bidder_id, status)
       SELECT UUID(), ?, bidder_id, 'not_awarded'
       FROM bids 
       WHERE auction_id = ? AND bidder_id != ?
       ON DUPLICATE KEY UPDATE status = 'not_awarded', updated_at = NOW()`,
      [auctionId, auctionId, bidderId]
    );

    return { success: true };
  });

  if (result.error) {
    if (result.error.message === 'Auction not found') {
      return res.status(404).json({ success: false, error: result.error.message });
    }
    console.error('Award bidder transaction error:', result.error);
    return res.status(500).json({ success: false, error: result.error.message });
  }

  // Send notification to awarded bidder
  // await sendAwardNotification(bidderId, auctionId);

  res.json({ success: true, message: 'Bidder awarded successfully' });
};

const disqualifyBidder = async (req, res) => {
  const { auctionId, bidderId } = req.params;
  const { reason } = req.body;
  
  try {
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Disqualification reason is required' });
    }

    // Use the simple query helper (no transaction needed for single query)
    const result = await db.query(
      `INSERT INTO auction_results (id, auction_id, bidder_id, status, disqualification_reason) 
       VALUES (UUID(), ?, ?, 'disqualified', ?) 
       ON DUPLICATE KEY UPDATE status = 'disqualified', disqualification_reason = ?, updated_at = NOW()`,
      [auctionId, bidderId, reason, reason]
    );

    if (result.error) {
      throw result.error;
    }

    res.json({ success: true, message: 'Bidder disqualified successfully' });
  } catch (error) {
    console.error('Disqualify bidder error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getAllAuctionBids = async (req, res) => {
  const { auctionId } = req.params; 
  
  try {
    // First, get the auction UUID from the auction_id
    const auctionResult = await db.query(`
      SELECT id 
      FROM auctions 
      WHERE auction_id = ?
    `, [auctionId]);
    
    if (auctionResult.error) {
      throw auctionResult.error;
    }
    
    if (!auctionResult.data || auctionResult.data.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Auction not found' 
      });
    }
    
    const auctionUUID = auctionResult.data[0].id;
    
    // Now get all bids for this auction using the UUID
    const result = await db.query(`
      SELECT 
        b.id as bid_id,
        b.bidder_id,
        u.user_id as bidder_user_id,
        u.name as bidder_name,
        u.company as company_name,
        b.amount as bid_amount,
        b.bid_time,
        b.is_winning,
        ar.status as result_status,
        ar.disqualification_reason
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      LEFT JOIN auction_results ar ON ar.auction_id = b.auction_id AND ar.bidder_id = b.bidder_id
      WHERE b.auction_id = ?
      ORDER BY b.bid_time DESC
    `, [auctionUUID]);
    
    if (result.error) {
      throw result.error;
    }
    
    res.json({ 
      success: true, 
      bids: result.data,
      auction_id: auctionId
    });
    
  } catch (error) {
    console.error('Get auction bids error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get top 5 bidders with their latest bid
const getTopBidders = async (req, res) => {
  const { auctionId } = req.params;
  
  try {
    const result = await db.query(`
      SELECT 
        b.bidder_id,
        u.name as bidder_name,
        u.company as company_name,
        b.amount as latest_bid_amount,
        b.bid_time as latest_bid_time,
        ar.status as result_status
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      LEFT JOIN auction_results ar ON ar.auction_id = b.auction_id AND ar.bidder_id = b.bidder_id
      WHERE b.auction_id = ? 
      AND b.bid_time = (
        SELECT MAX(bid_time) 
        FROM bids 
        WHERE auction_id = b.auction_id AND bidder_id = b.bidder_id
      )
      ORDER BY b.amount DESC
      LIMIT 5
    `, [auctionId]);

    if (result.error) {
      throw result.error;
    }

    res.json({ success: true, topBidders: result.data });
  } catch (error) {
    console.error('Get top bidders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  awardBidder,
  disqualifyBidder,
  getAllAuctionBids,
  getTopBidders
};