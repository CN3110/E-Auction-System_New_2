const db = require('../Config/database');
const { sendShortlistEmail, sendDisqualificationEmail, sendCancellationEmail, sendAwardEmail } = require('../services/emailService');

// ✅ Shortlist Top 5 Bidders (NEW FUNCTION)
const shortlistTopBidders = async (req, res) => {
  const { auctionId } = req.params;

  try {
    const result = await db.transaction(async (connection) => {
      // 1. Get auction UUID and validate
      const [auctionRows] = await connection.execute(
        'SELECT id, title FROM auctions WHERE auction_id = ? AND status = "ended"',
        [auctionId]
      );
      if (auctionRows.length === 0) throw new Error('Auction not found or not ended');
      const auctionUuid = auctionRows[0].id;
      const auctionTitle = auctionRows[0].title;

      // 2. Get top 5 bidders (lowest bids for reverse auction)
      const [topBiddersRows] = await connection.execute(`
        SELECT 
          b.bidder_id,
          u.name as bidder_name,
          u.email as bidder_email,
          u.company as company_name,
          b.amount as latest_bid_amount
        FROM bids b
        JOIN users u ON b.bidder_id = u.id
        WHERE b.auction_id = ? 
        AND b.bid_time = (
          SELECT MAX(bid_time) 
          FROM bids 
          WHERE auction_id = b.auction_id AND bidder_id = b.bidder_id
        )
        ORDER BY b.amount ASC
        LIMIT 5
      `, [auctionUuid]);

      if (topBiddersRows.length === 0) {
        throw new Error('No bidders found for this auction');
      }

      // 3. Mark top 5 as short-listed
      const topBidderIds = topBiddersRows.map(b => b.bidder_id);
      const placeholders = topBidderIds.map(() => '?').join(',');
      
      await connection.execute(`
        INSERT INTO auction_results (id, auction_id, bidder_id, status, shortlisted_at)
        SELECT UUID(), ?, bidder_id, 'short-listed', NOW()
        FROM (SELECT DISTINCT bidder_id FROM bids WHERE auction_id = ?) AS all_bidders
        WHERE bidder_id IN (${placeholders})
        ON DUPLICATE KEY UPDATE 
          status = 'short-listed', 
          shortlisted_at = NOW(), 
          updated_at = NOW()
      `, [auctionUuid, auctionUuid, ...topBidderIds]);

      // 4. Mark others as not-short-listed
      await connection.execute(`
        INSERT INTO auction_results (id, auction_id, bidder_id, status)
        SELECT UUID(), ?, bidder_id, 'not-short-listed'
        FROM (SELECT DISTINCT bidder_id FROM bids WHERE auction_id = ?) AS all_bidders
        WHERE bidder_id NOT IN (${placeholders})
        ON DUPLICATE KEY UPDATE 
          status = 'not-short-listed', 
          updated_at = NOW()
      `, [auctionUuid, auctionUuid, ...topBidderIds]);

      // 5. Send shortlist emails to top 5 bidders
      const emailPromises = topBiddersRows.map(bidder => 
        sendShortlistEmail({
          to: bidder.bidder_email,
          bidderName: bidder.bidder_name,
          auctionId: auctionId,
          auctionTitle: auctionTitle,
          bidAmount: bidder.latest_bid_amount
        })
      );

      try {
        await Promise.all(emailPromises);
        console.log('Shortlist emails sent successfully');
      } catch (emailError) {
        console.error('Error sending shortlist emails:', emailError);
        // Don't fail the transaction for email errors
      }

      return { 
        shortlisted: topBiddersRows.length,
        notShortlisted: topBidderIds.length > 0 ? await connection.execute(
          `SELECT COUNT(*) as count FROM bids WHERE auction_id = ? AND bidder_id NOT IN (${placeholders})`,
          [auctionUuid, ...topBidderIds]
        ).then(([rows]) => rows[0].count) : 0
      };
    });

    if (result.error) throw result.error;

    res.json({ 
      success: true, 
      message: `Successfully shortlisted top ${result.shortlisted} bidders`,
      data: result
    });
  } catch (error) {
    console.error('Shortlist top bidders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Award Bidder (UPDATED)
const awardBidder = async (req, res) => {
  const { auctionId, bidderId } = req.params;

  try {
    const result = await db.transaction(async (connection) => {
      // 1. Get auction UUID and title
      const [auctionRows] = await connection.execute(
        'SELECT id, title FROM auctions WHERE auction_id = ?',
        [auctionId]
      );
      if (auctionRows.length === 0) throw new Error('Auction not found');
      const auctionUuid = auctionRows[0].id;
      const auctionTitle = auctionRows[0].title;

      // 2. Get bidder details
      const [bidderRows] = await connection.execute(
        'SELECT id, name, email FROM users WHERE id = ?',
        [bidderId]
      );
      if (bidderRows.length === 0) throw new Error('Bidder not found');
      const bidderUuid = bidderRows[0].id;
      const bidderName = bidderRows[0].name;
      const bidderEmail = bidderRows[0].email;

      // 3. Mark this bidder awarded
      await connection.execute(
        `INSERT INTO auction_results (id, auction_id, bidder_id, status)
         VALUES (UUID(), ?, ?, 'awarded')
         ON DUPLICATE KEY UPDATE status = 'awarded', updated_at = NOW()`,
        [auctionUuid, bidderUuid]
      );

      // 4. Mark all others not awarded (only those who were short-listed)
      await connection.execute(
        `UPDATE auction_results 
         SET status = 'not_awarded', updated_at = NOW()
         WHERE auction_id = ? AND bidder_id != ? AND status = 'short-listed'`,
        [auctionUuid, bidderUuid]
      );

      // 5. Send award email
      try {
        await sendAwardEmail({
          to: bidderEmail,
          bidderName: bidderName,
          auctionId: auctionId,
          auctionTitle: auctionTitle
        });
        console.log('Award email sent successfully');
      } catch (emailError) {
        console.error('Error sending award email:', emailError);
      }

      return { bidderName };
    });

    if (result.error) throw result.error;

    res.json({ success: true, message: `${result.bidderName} awarded successfully` });
  } catch (error) {
    console.error('Award bidder error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Mark Bidder as Not Awarded (NEW FUNCTION)
const markBidderNotAwarded = async (req, res) => {
  const { auctionId, bidderId } = req.params;

  try {
    const result = await db.transaction(async (connection) => {
      // 1. Get auction UUID
      const [auctionRows] = await connection.execute(
        'SELECT id FROM auctions WHERE auction_id = ?',
        [auctionId]
      );
      if (auctionRows.length === 0) throw new Error('Auction not found');
      const auctionUuid = auctionRows[0].id;

      // 2. Get bidder UUID
      const [bidderRows] = await connection.execute(
        'SELECT id, name FROM users WHERE id = ?',
        [bidderId]
      );
      if (bidderRows.length === 0) throw new Error('Bidder not found');
      const bidderUuid = bidderRows[0].id;
      const bidderName = bidderRows[0].name;

      // 3. Mark as not awarded
      await connection.execute(
        `INSERT INTO auction_results (id, auction_id, bidder_id, status)
         VALUES (UUID(), ?, ?, 'not_awarded')
         ON DUPLICATE KEY UPDATE status = 'not_awarded', updated_at = NOW()`,
        [auctionUuid, bidderUuid]
      );

      return { bidderName };
    });

    if (result.error) throw result.error;

    res.json({ success: true, message: `${result.bidderName} marked as not awarded` });
  } catch (error) {
    console.error('Mark not awarded error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Disqualify Bidder (UPDATED)
const disqualifyBidder = async (req, res) => {
  const { auctionId, bidderId } = req.params;
  const { reason } = req.body;

  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Disqualification reason is required' });
  }

  try {
    const result = await db.transaction(async (connection) => {
      // 1. Get auction UUID and title
      const [auctionRows] = await connection.execute(
        'SELECT id, title FROM auctions WHERE auction_id = ?',
        [auctionId]
      );
      if (auctionRows.length === 0) throw new Error('Auction not found');
      const auctionUuid = auctionRows[0].id;
      const auctionTitle = auctionRows[0].title;

      // 2. Get bidder details
      const [bidderRows] = await connection.execute(
        'SELECT id, name, email FROM users WHERE id = ?',
        [bidderId]
      );
      if (bidderRows.length === 0) throw new Error('Bidder not found');
      const bidderUuid = bidderRows[0].id;
      const bidderName = bidderRows[0].name;
      const bidderEmail = bidderRows[0].email;

      // 3. Insert/update disqualification
      await connection.execute(
        `INSERT INTO auction_results (id, auction_id, bidder_id, status, disqualification_reason)
         VALUES (UUID(), ?, ?, 'disqualified', ?)
         ON DUPLICATE KEY UPDATE status = 'disqualified', disqualification_reason = ?, updated_at = NOW()`,
        [auctionUuid, bidderUuid, reason, reason]
      );

      // 4. Send disqualification email
      try {
        await sendDisqualificationEmail({
          to: bidderEmail,
          bidderName: bidderName,
          auctionId: auctionId,
          auctionTitle: auctionTitle,
          reason: reason
        });
        console.log('Disqualification email sent successfully');
      } catch (emailError) {
        console.error('Error sending disqualification email:', emailError);
      }

      return { bidderName };
    });

    if (result.error) throw result.error;

    res.json({ success: true, message: `${result.bidderName} disqualified successfully` });
  } catch (error) {
    console.error('Disqualify bidder error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Cancel Auction (NEW FUNCTION)
const cancelAuction = async (req, res) => {
  const { auctionId } = req.params;
  const { reason } = req.body;
  const adminId = req.user.id; // From auth middleware

  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Cancellation reason is required' });
  }

  try {
    const result = await db.transaction(async (connection) => {
      // 1. Get auction details
      const [auctionRows] = await connection.execute(
        'SELECT id, title, status FROM auctions WHERE auction_id = ?',
        [auctionId]
      );
      if (auctionRows.length === 0) throw new Error('Auction not found');
      
      const auctionUuid = auctionRows[0].id;
      const auctionTitle = auctionRows[0].title;
      const currentStatus = auctionRows[0].status;

      // Check if auction can be cancelled
      if (['cancelled', 'ended'].includes(currentStatus)) {
        throw new Error(`Cannot cancel auction with status: ${currentStatus}`);
      }

      // 2. Update auction status to cancelled
      await connection.execute(
        `UPDATE auctions 
         SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW(), cancellation_reason = ?
         WHERE id = ?`,
        [adminId, reason, auctionUuid]
      );

      // 3. Update all auction results to cancelled
      await connection.execute(
        `INSERT INTO auction_results (id, auction_id, bidder_id, status, cancel_reason)
         SELECT UUID(), ?, bidder_id, 'cancel', ?
         FROM bids 
         WHERE auction_id = ?
         ON DUPLICATE KEY UPDATE status = 'cancel', cancel_reason = ?, updated_at = NOW()`,
        [auctionUuid, reason, auctionUuid, reason]
      );

      // 4. Get all bidder emails for notification
      const [bidderEmails] = await connection.execute(`
        SELECT DISTINCT u.email, u.name
        FROM bids b
        JOIN users u ON b.bidder_id = u.id
        WHERE b.auction_id = ?
      `, [auctionUuid]);

      // 5. Send cancellation emails to all bidders
      const emailPromises = bidderEmails.map(bidder => 
        sendCancellationEmail({
          to: bidder.email,
          bidderName: bidder.name,
          auctionId: auctionId,
          auctionTitle: auctionTitle,
          reason: reason
        })
      );

      try {
        await Promise.all(emailPromises);
        console.log('Cancellation emails sent successfully');
      } catch (emailError) {
        console.error('Error sending cancellation emails:', emailError);
      }

      return { auctionTitle, biddersNotified: bidderEmails.length };
    });

    if (result.error) throw result.error;

    res.json({ 
      success: true, 
      message: `Auction "${result.auctionTitle}" cancelled successfully`,
      biddersNotified: result.biddersNotified
    });
  } catch (error) {
    console.error('Cancel auction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update existing functions...
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
        ar.disqualification_reason,
        ar.cancel_reason,
        ar.shortlisted_at
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

// Get top bidders for reverse auction (updated to include new statuses)
const getTopBidders = async (req, res) => {
  const { auctionId } = req.params;
  
  try {
    console.log(`Fetching top bidders for auction: ${auctionId}`);
    
    // First, check if the auction exists and get its UUID
    const auctionCheck = await db.query(`
      SELECT id, status FROM auctions WHERE auction_id = ?
    `, [auctionId]);

    if (auctionCheck.error || !auctionCheck.data.length) {
      return res.status(404).json({ 
        success: false, 
        error: 'Auction not found' 
      });
    }

    const auctionUuid = auctionCheck.data[0].id;
    const auctionStatus = auctionCheck.data[0].status;

    const result = await db.query(`
      SELECT 
        b.bidder_id,
        u.name as bidder_name,
        u.company as company_name,
        b.amount as latest_bid_amount,
        b.bid_time as latest_bid_time,
        ar.status as result_status,
        ar.disqualification_reason,
        ar.cancel_reason,
        ar.shortlisted_at
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      LEFT JOIN auction_results ar ON ar.auction_id = b.auction_id AND ar.bidder_id = b.bidder_id
      WHERE b.auction_id = ? 
      AND b.bid_time = (
        SELECT MAX(bid_time) 
        FROM bids 
        WHERE auction_id = b.auction_id AND bidder_id = b.bidder_id
      )
      ORDER BY b.amount ASC
      LIMIT 5
    `, [auctionUuid]);

    if (result.error) {
      throw result.error;
    }

    console.log(`Found ${result.data.length} top bidders`);

    res.json({ 
      success: true, 
      topBidders: result.data,
      totalBidders: result.data.length,
      auctionStatus: auctionStatus
    });
  } catch (error) {
    console.error('Get top bidders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update helper function to include new statuses
const formatResultStatus = (status) => {
  const statusMap = {
    'pending': 'Pending Review',
    'short-listed': 'Short-Listed 📋',
    'not-short-listed': 'Not Short-Listed',
    'awarded': 'Awarded 🎉',
    'not_awarded': 'Not Awarded',
    'disqualified': 'Disqualified ❌',
    'cancel': 'Cancelled 🚫'
  };
  return statusMap[status] || status;
};

// Other existing functions remain the same...
const getAuctionResultsOverview = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        a.auction_id AS "Auction ID",
        a.title AS "Title",
        u.id AS "Winning Bidder ID",
        u.name AS "Bidder Name",
        u.user_id AS "Bidder User ID",
        u.company AS "Company",
        (SELECT amount FROM bids 
         WHERE auction_id = a.id AND bidder_id = u.id 
         ORDER BY bid_time DESC LIMIT 1) AS "Winning Bidding Price",
        ar.status AS "Award Status",
        ar.quotation_uploaded_at AS "Quotation Uploaded",
        a.auction_date AS "Auction Date",
        a.status AS "Auction Status"
      FROM auction_results ar
      INNER JOIN auctions a ON ar.auction_id = a.id
      INNER JOIN users u ON ar.bidder_id = u.id
      WHERE ar.status IN ('awarded', 'short-listed')
      ORDER BY a.auction_date DESC, a.created_at DESC
    `);

    if (result.error) {
      throw result.error;
    }

    res.json({
      success: true,
      auctionResults: result.data,
      totalResults: result.data.length
    });

  } catch (error) {
    console.error('Get auction results overview error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

const getBidderAuctionResults = async (req, res) => {
  try {
    const bidderId = req.user.id;
    
    const result = await db.query(`
      SELECT 
        a.auction_id AS "Auction ID",
        a.title AS "Title",
        MAX(b.amount) AS "Bid Amount",
        ar.status AS "Result",
        CONCAT(a.auction_date, ' ', a.start_time) AS "Date Time",
        a.auction_date AS "Auction Date",
        a.start_time AS "Start Time",
        ar.disqualification_reason AS "Disqualification Reason",
        ar.cancel_reason AS "Cancel Reason",
        ar.quotation_uploaded_at AS "Quotation Uploaded",
        ar.shortlisted_at AS "Shortlisted At",
        ar.updated_at AS "Result Updated"
      FROM auction_results ar
      INNER JOIN auctions a ON ar.auction_id = a.id
      INNER JOIN bids b ON b.auction_id = a.id AND b.bidder_id = ar.bidder_id
      WHERE ar.bidder_id = ?
      GROUP BY a.auction_id, a.title, ar.status, a.auction_date, a.start_time, 
               ar.disqualification_reason, ar.cancel_reason, ar.quotation_uploaded_at, 
               ar.shortlisted_at, ar.updated_at
      ORDER BY a.auction_date DESC, a.start_time DESC
    `, [bidderId]);

    if (result.error) {
      throw result.error;
    }

    const formattedResults = result.data.map(item => ({
      "Auction ID": item["Auction ID"],
      "Title": item["Title"],
      "Bid Amount": item["Bid Amount"],
      "Result": formatResultStatus(item["Result"]),
      "Date Time": formatDateTime(item["Auction Date"], item["Start Time"]),
      "Raw Status": item["Result"],
      "Disqualification Reason": item["Disqualification Reason"],
      "Cancel Reason": item["Cancel Reason"],
      "Quotation Uploaded": item["Quotation Uploaded"],
      "Shortlisted At": item["Shortlisted At"]
    }));

    res.json({
      success: true,
      auctionResults: formattedResults,
      totalResults: formattedResults.length
    });

  } catch (error) {
    console.error('Get bidder auction results error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

const formatDateTime = (date, time) => {
  const dateObj = new Date(date);
  const timeObj = new Date(`1970-01-01T${time}`);
  
  return `${dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })} ${timeObj.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })}`;
};

module.exports = {
  shortlistTopBidders,         // NEW
  awardBidder,                 // UPDATED
  markBidderNotAwarded,        // NEW
  disqualifyBidder,            // UPDATED
  cancelAuction,               // NEW
  getAllAuctionBids,           // UPDATED
  getTopBidders,               // UPDATED
  getAuctionResultsOverview,   // UPDATED
  getBidderAuctionResults,     // UPDATED
  formatResultStatus,          // UPDATED
  formatDateTime
};