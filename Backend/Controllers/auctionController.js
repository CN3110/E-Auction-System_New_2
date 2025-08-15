const { query, transaction } = require('../Config/database');
const { generateAuctionId } = require('../Utils/generators');
const { sendEmail } = require('../Config/email');
const moment = require('moment-timezone');

// Helper function to get current Sri Lanka time
const getCurrentSLTime = () => {
  return moment().tz('Asia/Colombo');
};


// FIXED: Updated getAuctionStatus with proper timezone handling
const getAuctionStatus = (auction) => {
  const nowSL = getCurrentSLTime();
  const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
  const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
  
  // If auction is rejected or still pending approval
  if (auction.status === 'rejected' || auction.status === 'pending') {
    return auction.status;
  }
  
  // Only check time-based status if auction is approved
  if (auction.status === 'approved') {
    if (nowSL.isBefore(startDateTime)) {
      return 'approved'; // Keep as approved until start time
    } else if (nowSL.isBetween(startDateTime, endDateTime, null, '[]')) {
      return 'live';
    } else {
      return 'ended';
    }
  }
  
  // For live status, check if it should end
  if (auction.status === 'live') {
    if (nowSL.isSameOrAfter(endDateTime)) {
      return 'ended';
    } else {
      return 'live';
    }
  }
  
  // For legacy auctions without approval workflow
  if (nowSL.isBefore(startDateTime)) {
    return 'pending';
  } else if (nowSL.isBetween(startDateTime, endDateTime, null, '[]')) {
    return 'live';
  } else {
    return 'ended';
  }
};

// FIXED: Updated createAuction function - REMOVED email sending (emails only sent on approval)
const createAuction = async (req, res) => {
  try {
    console.log('Create auction request received');
    console.log('Request user:', req.user);
    console.log('Request body:', req.body);

    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      console.log('Authentication failed - no user or user ID');
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required. User not found in request.' 
      });
    }

    const { 
      title, 
      auction_date, 
      start_time, 
      duration_minutes, 
      special_notices, 
      selected_bidders,
      category,
      sbu,
      created_by_name
    } = req.body;
    
    // Validate input
    if (!title || !auction_date || !start_time || !duration_minutes || 
        !selected_bidders?.length || !category || !sbu || !created_by_name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: title, auction_date, start_time, duration_minutes, selected_bidders, category, sbu, or created_by_name' 
      });
    }

    // Validate SBU is one of the allowed values
    const allowedSBUs = ['SBU1', 'SBU2', 'SBU3', 'SBU4'];
    if (!allowedSBUs.includes(sbu)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid SBU value'
      });
    }

    // FIXED: Validate auction date/time is in future (Sri Lanka time)
    const nowSL = getCurrentSLTime();
    const auctionDateTime = moment.tz(`${auction_date} ${start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
    
    if (!auctionDateTime.isValid()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date or time format. Use YYYY-MM-DD for date and HH:mm:ss for time'
      });
    }

    if (auctionDateTime.isBefore(nowSL)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Auction date and time must be in the future (Sri Lanka time)' 
      });
    }

    // Validate selected bidders exist
    console.log('Validating selected bidders:', selected_bidders);
    const { data: validBidders, error: biddersValidationError } = await query(
      `SELECT id FROM users WHERE id IN (${selected_bidders.map(() => '?').join(',')}) AND role = 'bidder' AND is_active = TRUE`,
      selected_bidders
    );
    
    if (biddersValidationError) {
      console.error('Error validating bidders:', biddersValidationError);
      return res.status(400).json({
        success: false,
        error: 'Error validating selected bidders'
      });
    }

    if (!validBidders || validBidders.length !== selected_bidders.length) {
      return res.status(400).json({
        success: false,
        error: 'One or more selected bidders are invalid or inactive'
      });
    }

    // Get last auction ID
    const { data: lastAuction, error: lastAuctionError } = await query(
      'SELECT auction_id FROM auctions ORDER BY auction_id DESC LIMIT 1'
    );
    
    if (lastAuctionError) {
      console.error('Error fetching last auction ID:', lastAuctionError);
      throw lastAuctionError;
    }
    
    const auctionId = generateAuctionId(lastAuction?.[0]?.auction_id);
    console.log('Generated auction ID:', auctionId);
    
    // Create auction with transaction
    const result = await transaction(async (connection) => {
      // Insert auction - All new auctions start as 'pending' and need approval
      console.log('Creating auction with pending status for approval workflow');
      
      const [auctionResult] = await connection.execute(
        `INSERT INTO auctions (
          auction_id, 
          title, 
          auction_date, 
          start_time, 
          duration_minutes, 
          special_notices, 
          status,
          category,
          sbu,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          auctionId, 
          title, 
          auction_date, 
          start_time, 
          duration_minutes, 
          special_notices || null, 
          'pending', // All new auctions start as pending
          category,
          sbu,
          created_by_name
        ]
      );

      console.log('Auction inserted with result:', auctionResult);
      
      // Get the created auction using the UUID id
      const [createdAuction] = await connection.execute(
        'SELECT * FROM auctions WHERE auction_id = ?',
        [auctionId]
      );

      if (!createdAuction.length) {
        throw new Error('Failed to retrieve created auction');
      }

      console.log('Retrieved created auction:', createdAuction[0]);

      // Add selected bidders
      const auctionUUID = createdAuction[0].id;
      const bidderInvites = selected_bidders.map(bidderId => [auctionUUID, bidderId]);
      
      if (bidderInvites.length > 0) {
        const placeholders = bidderInvites.map(() => '(?, ?)').join(', ');
        const flatValues = bidderInvites.flat();
        
        console.log('Inserting auction bidders:', flatValues);
        
        await connection.execute(
          `INSERT INTO auction_bidders (auction_id, bidder_id) VALUES ${placeholders}`,
          flatValues
        );
      }

      return { auction: createdAuction[0], auction_id: auctionId };
    });

    if (result.error) {
      console.error('Transaction error:', result.error);
      throw result.error;
    }
    
    console.log('Auction created successfully and is pending approval:', result.data);
    
    // NOTE: NO EMAIL SENDING HERE - Emails are only sent when auction is approved
    
    res.json({ 
      success: true, 
      auction: result.data.auction, 
      auction_id: result.data.auction_id,
      message: 'Auction created successfully and is pending approval. Bidders will be notified once approved.'
    });

  } catch (error) {
    console.error('Create auction error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// FIXED: Updated getLiveAuction function with proper timezone handling and debugging
const getLiveAuction = async (req, res) => {
  try {
    const bidderId = req.user.id;
    const nowSL = getCurrentSLTime();
    
    console.log('Getting live auctions for bidder:', bidderId);
    console.log('Current SL time:', nowSL.format('YYYY-MM-DD HH:mm:ss'));

    // FIXED: Get all APPROVED auctions the bidder is invited to with proper timezone conversion
    const { data: invitedAuctions, error } = await query(`
      SELECT a.*, 
             u.name as bidder_name,
             u.user_id as bidder_user_id,
             CONVERT_TZ(CONCAT(a.auction_date, ' ', a.start_time), '+00:00', '+05:30') as start_datetime_sl,
             CONVERT_TZ(DATE_ADD(CONCAT(a.auction_date, ' ', a.start_time), INTERVAL a.duration_minutes MINUTE), '+00:00', '+05:30') as end_datetime_sl
      FROM auctions a
      JOIN auction_bidders ab ON a.id = ab.auction_id
      JOIN users u ON ab.bidder_id = u.id
      WHERE ab.bidder_id = ? AND a.status IN ('approved', 'live')
      ORDER BY a.auction_date DESC, a.start_time DESC
    `, [bidderId]);

    if (error) {
      console.error('Error fetching invited auctions:', error);
      throw new Error('Error fetching invited auctions');
    }

    console.log(`Found ${invitedAuctions?.length || 0} invited auctions for bidder ${bidderId}`);
    
    if (!invitedAuctions || invitedAuctions.length === 0) {
      console.log('No invited auctions found for this bidder');
      return res.status(200).json({
        success: true,
        count: 0,
        auctions: [],
        current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss'),
        message: 'No invited auctions found'
      });
    }

    // FIXED: Filter for currently live auctions with proper timezone handling
    const liveAuctions = invitedAuctions.filter(auction => {
      const liveStatus = isAuctionLive(auction);
      console.log(`Auction ${auction.auction_id} live status: ${liveStatus}`);
      return liveStatus;
    });

    console.log(`Found ${liveAuctions.length} live auctions`);

    // Add calculated status and timing info to each auction
    const enrichedLiveAuctions = liveAuctions.map(auction => {
      const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
      const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
      const timeRemaining = endDateTime.diff(nowSL, 'milliseconds');
      
      return {
        ...auction,
        calculated_status: 'live',
        is_live: true,
        time_remaining_ms: Math.max(0, timeRemaining),
        start_datetime_sl: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
        end_datetime_sl: endDateTime.format('YYYY-MM-DD HH:mm:ss')
      };
    });

    res.status(200).json({
      success: true,
      count: enrichedLiveAuctions.length,
      auctions: enrichedLiveAuctions,
      current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss'),
      debug: {
        bidderId,
        totalInvitedAuctions: invitedAuctions.length,
        liveAuctionCount: enrichedLiveAuctions.length
      }
    });

  } catch (err) {
    console.error('Error fetching live auctions:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch live auctions',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};


// FIXED: Helper function to check if auction is live with proper timezone handling
const isAuctionLive = (auction) => {
  try {
    const nowSL = getCurrentSLTime();
    
    // Create start and end times in Sri Lanka timezone
    const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
    const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
    
    // Check if auction is approved and within time bounds
    const isApproved = auction.status === 'approved' || auction.status === 'live';
    const isWithinTimeRange = nowSL.isSameOrAfter(startDateTime) && nowSL.isBefore(endDateTime);
    
    console.log(`isAuctionLive check for ${auction.auction_id || auction.id}:`);
    console.log(`  - Status: ${auction.status} (approved: ${isApproved})`);
    console.log(`  - Now SL: ${nowSL.format('YYYY-MM-DD HH:mm:ss')}`);
    console.log(`  - Start SL: ${startDateTime.format('YYYY-MM-DD HH:mm:ss')}`);
    console.log(`  - End SL: ${endDateTime.format('YYYY-MM-DD HH:mm:ss')}`);
    console.log(`  - Within time: ${isWithinTimeRange}`);
    console.log(`  - Final result: ${isApproved && isWithinTimeRange}`);
    
    return isApproved && isWithinTimeRange;
  } catch (error) {
    console.error('Error in isAuctionLive:', error);
    return false;
  }
};

// Get all auctions (with filtering) - UPDATED for approval workflow
const getAllAuctions = async (req, res) => {
  try {
    const { status, date } = req.query;
    const userRole = req.user?.role;
    const userId = req.user?.id;

    let sql = '';
    let params = [];

    if (userRole === 'admin' || userRole === 'system_admin') {
      // Admin and System Admin can see all auctions
      sql = 'SELECT * FROM auctions';
      if (status) {
        sql += ' WHERE status = ?';
        params.push(status);
      }
      if (date) {
        sql += status ? ' AND auction_date = ?' : ' WHERE auction_date = ?';
        params.push(date);
      }
    } else {
      // Bidders can only see APPROVED auctions they're invited to
      sql = `
        SELECT a.* FROM auctions a
        JOIN auction_bidders ab ON a.id = ab.auction_id
        WHERE ab.bidder_id = ? AND a.status IN ('approved', 'live', 'ended')
      `;
      params.push(userId);
      
      if (status) {
        sql += ' AND a.status = ?';
        params.push(status);
      }
      if (date) {
        sql += ' AND a.auction_date = ?';
        params.push(date);
      }
    }

    sql += ' ORDER BY auction_date DESC, start_time DESC';

    const { data: auctions, error } = await query(sql, params);

    if (error) {
      console.error('Get auctions error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch auctions'
      });
    }

    // Update status based on current time for each auction
    const auctionsWithUpdatedStatus = auctions.map(auction => ({
      ...auction,
      calculated_status: getAuctionStatus(auction),
      is_live: isAuctionLive(auction)
    }));

    res.json({
      success: true,
      auctions: auctionsWithUpdatedStatus,
      current_time_sl: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
    });

  } catch (error) {
    console.error('Get all auctions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};


// FIXED: Get live auctions for admin with proper timezone handling
const getAdminLiveAuctions = async (req, res) => {
  try {
    const nowSL = getCurrentSLTime();
    console.log('Admin requesting live auctions at SL time:', nowSL.format('YYYY-MM-DD HH:mm:ss'));

    // FIXED: Get all auctions with timezone conversion
    const { data: auctions, error } = await query(`
      SELECT *,
             CONVERT_TZ(CONCAT(auction_date, ' ', start_time), '+00:00', '+05:30') as start_datetime_sl,
             CONVERT_TZ(DATE_ADD(CONCAT(auction_date, ' ', start_time), INTERVAL duration_minutes MINUTE), '+00:00', '+05:30') as end_datetime_sl
      FROM auctions 
      WHERE status IN ('approved', 'live')
      ORDER BY auction_date DESC, start_time DESC
    `);

    if (error) {
      console.error('Get admin live auctions error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch auctions'
      });
    }

    console.log(`Found ${auctions?.length || 0} approved/live auctions`);

    // FIXED: Filter for live auctions with proper timezone handling
    const liveAuctions = auctions.filter(auction => {
      const liveStatus = isAuctionLive(auction);
      console.log(`Admin view - Auction ${auction.auction_id} live status: ${liveStatus}`);
      return liveStatus;
    });

    console.log(`Found ${liveAuctions.length} currently live auctions for admin`);

    // Add calculated status and time info
    const enrichedLiveAuctions = liveAuctions.map(auction => {
      const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
      const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
      const timeRemaining = endDateTime.diff(nowSL, 'milliseconds');
      
      return {
        ...auction,
        calculated_status: 'live',
        is_live: true,
        time_remaining_ms: Math.max(0, timeRemaining),
        start_datetime_sl: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
        end_datetime_sl: endDateTime.format('YYYY-MM-DD HH:mm:ss')
      };
    });

    res.json({
      success: true,
      auctions: enrichedLiveAuctions,
      count: enrichedLiveAuctions.length,
      current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss')
    });

  } catch (error) {
    console.error('Get admin live auctions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};


// FIXED: Function to update auction statuses in database with proper timezone
const updateAuctionStatuses = async () => {
  try {
    console.log('Updating auction statuses...');
    const { data: auctions, error } = await query(
      'SELECT id, auction_id, auction_date, start_time, duration_minutes, status FROM auctions WHERE status IN (?, ?, ?)',
      ['approved', 'live', 'ended']
    );
    
    if (error) {
      console.error('Error fetching auctions for status update:', error);
      return;
    }

    const nowSL = getCurrentSLTime();
    console.log('Current SL time for status update:', nowSL.format('YYYY-MM-DD HH:mm:ss'));

    for (const auction of auctions) {
      let newStatus = auction.status;
      
      // Only update status for approved auctions
      if (auction.status === 'approved') {
        const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
        const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
        
        if (nowSL.isSameOrAfter(startDateTime) && nowSL.isBefore(endDateTime)) {
          newStatus = 'live';
        } else if (nowSL.isSameOrAfter(endDateTime)) {
          newStatus = 'ended';
        }
      } else if (auction.status === 'live') {
        const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
        const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
        
        if (nowSL.isSameOrAfter(endDateTime)) {
          newStatus = 'ended';
        }
      }
      
      // Only update if status has changed
      if (auction.status !== newStatus) {
        await query(
          'UPDATE auctions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newStatus, auction.id]
        );
        console.log(`Updated auction ${auction.auction_id} status from ${auction.status} to ${newStatus}`);
      }
    }
  } catch (error) {
    console.error('Error updating auction statuses:', error);
  }
};


// Get auction results with proper timezone handling
const getAuctionResults = async (req, res) => {
  try {
    // Get all auctions
    const { data: auctions, error: auctionsError } = await query(
      'SELECT * FROM auctions ORDER BY auction_date DESC, start_time DESC'
    );

    if (auctionsError) {
      console.error('Get auction results error:', auctionsError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch auction results'
      });
    }

    const results = await Promise.all(
      auctions.map(async (auction) => {
        try {
          // Check if auction has ended using Sri Lanka time
          const auctionStatus = getAuctionStatus(auction);
          const hasEnded = auctionStatus === 'ended' || auction.status === 'cancelled';

          if (!hasEnded && auction.status !== 'cancelled') {
            return null; // Skip ongoing auctions
          }

          // Get winner information for ended auctions
          let winner = null;
          let winningPrice = null;

          if (auction.status !== 'cancelled') {
            // Get all bids for this auction
            const { data: auctionBids } = await query(`
              SELECT b.bidder_id, b.amount, b.bid_time,
                     u.user_id, u.name, u.company
              FROM bids b
              JOIN users u ON b.bidder_id = u.id
              WHERE b.auction_id = ?
            `, [auction.id]);

            if (auctionBids && auctionBids.length > 0) {
              // Group by bidder and get their lowest bid
              const bidderLowestBids = {};
              auctionBids.forEach(bid => {
                const bidderId = bid.bidder_id;
                if (!bidderLowestBids[bidderId] || bid.amount < bidderLowestBids[bidderId].amount) {
                  bidderLowestBids[bidderId] = {
                    amount: bid.amount,
                    bid_time: bid.bid_time,
                    user_id: bid.user_id,
                    name: bid.name,
                    company: bid.company
                  };
                }
              });

              // Find the winner (lowest amount, earliest time if tie)
              if (Object.keys(bidderLowestBids).length > 0) {
                const sortedBidders = Object.entries(bidderLowestBids)
                  .sort(([, bidA], [, bidB]) => {
                    if (bidA.amount === bidB.amount) {
                      return new Date(bidA.bid_time) - new Date(bidB.bid_time);
                    }
                    return bidA.amount - bidB.amount;
                  });

                const [winnerId, winnerInfo] = sortedBidders[0];
                winner = {
                  bidder_id: winnerId,
                  user_id: winnerInfo.user_id,
                  name: winnerInfo.name,
                  company: winnerInfo.company
                };
                winningPrice = winnerInfo.amount;
              }
            }
          }

          return {
            auction_id: auction.auction_id,
            title: auction.title,
            auction_date: auction.auction_date,
            start_time: auction.start_time,
            status: hasEnded ? (auction.status === 'cancelled' ? 'cancelled' : 'completed') : auction.status,
            winning_bidder_id: winner?.user_id || null,
            bidder_name: winner?.name || null,
            bidder_company: winner?.company || null,
            winning_price: winningPrice
          };

        } catch (error) {
          console.error(`Error processing auction ${auction.id}:`, error);
          return {
            auction_id: auction.auction_id,
            title: auction.title,
            auction_date: auction.auction_date,
            start_time: auction.start_time,
            status: 'error',
            winning_bidder_id: null,
            bidder_name: null,
            bidder_company: null,
            winning_price: null
          };
        }
      })
    );

    // Filter out null results (ongoing auctions) and sort by date
    const filteredResults = results
      .filter(result => result !== null)
      .sort((a, b) => new Date(b.auction_date) - new Date(a.auction_date));

    res.json({
      success: true,
      results: filteredResults,
      current_time_sl: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
    });

  } catch (error) {
    console.error('Get auction results error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// view auctions by auction ID - selected auction ID 
const getAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;

    const { data: auction, error } = await query(`
      SELECT 
        a.id,
        a.auction_id,
        a.title,
        a.status,
        CONCAT(a.auction_date, ' ', a.start_time) AS date_time,
        a.duration_minutes AS duration,
        a.created_by,
        a.created_at,
        a.special_notices,
        a.sbu,
        a.category,
        a.updated_at,
        GROUP_CONCAT(
          JSON_OBJECT(
            'bidder_id', ab.bidder_id,
            'name', u.name,
            'company', u.company,
            'email', u.email,
            'phone', u.phone
          )
        ) AS invited_bidders,
        (
          SELECT COUNT(*) 
          FROM bids b 
          WHERE b.auction_id = a.id
        ) AS total_bids,
        (
          SELECT MAX(amount) 
          FROM bids b 
          WHERE b.auction_id = a.id
        ) AS highest_bid,
        (
          SELECT JSON_OBJECT(
            'winner_id', ar.winner_id,
            'winning_amount', ar.winning_amount,
            'ended_at', ar.ended_at
          )
          FROM auction_results ar
          WHERE ar.auction_id = a.id
          LIMIT 1
        ) AS result_info
      FROM 
        auctions a
      LEFT JOIN 
        auction_bidders ab ON a.id = ab.auction_id
      LEFT JOIN 
        users u ON ab.bidder_id = u.id
      WHERE 
        a.auction_id = ?
      GROUP BY 
        a.id
    `, [auctionId]);

    if (error || !auction || auction.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    const auctionData = auction[0];
    
    // Parse JSON fields
    if (auctionData.invited_bidders) {
      auctionData.invited_bidders = JSON.parse(`[${auctionData.invited_bidders}]`);
    }
    if (auctionData.result_info) {
      auctionData.result_info = JSON.parse(auctionData.result_info);
    }

    // Add calculated status and timing info
    auctionData.calculated_status = getAuctionStatus(auctionData);
    auctionData.is_live = isAuctionLive(auctionData);

    res.json({
      success: true,
      auction: auctionData,
      current_time_sl: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
    });

  } catch (error) {
    console.error('Get auction error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

const getLiveRankings = async (req, res) => {
  try {
    const { auctionId } = req.params;

    // Get all bids for this auction with bidder information
    const { data: allBids, error } = await query(`
      SELECT b.bidder_id, b.amount, b.bid_time,
             u.user_id, u.name, u.company
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      WHERE b.auction_id = ?
      ORDER BY b.bid_time DESC
    `, [auctionId]);

    if (error) {
      console.error('Get rankings error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch rankings'
      });
    }

    if (!allBids || allBids.length === 0) {
      return res.json({
        success: true,
        rankings: []
      });
    }

    // Group by bidder and get their lowest bid (reverse auction - lowest wins)
    const bidderLowestBids = {};
    allBids.forEach(bid => {
      const bidderId = bid.bidder_id;
      if (!bidderLowestBids[bidderId] || bid.amount < bidderLowestBids[bidderId].amount) {
        bidderLowestBids[bidderId] = {
          bidder_id: bidderId,
          amount: bid.amount,
          bid_time: bid.bid_time,
          user_id: bid.user_id,
          name: bid.name,
          company: bid.company
        };
      }
    });

    // Convert to array and sort by amount (lowest first = rank 1)
    const rankings = Object.values(bidderLowestBids)
      .sort((a, b) => a.amount - b.amount);

    res.json({
      success: true,
      rankings: rankings || [],
      current_time_sl: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
    });

  } catch (error) {
    console.error('Get live rankings error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

const getAdminAuctionRankings = async (req, res) => {
  try {
    const { auctionId } = req.params;

    // Get all bids for this auction with bidder information
    const { data: allBids, error } = await query(`
      SELECT b.bidder_id, b.amount, b.bid_time,
             u.user_id, u.name, u.company
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      WHERE b.auction_id = ?
      ORDER BY b.bid_time DESC
    `, [auctionId]);

    if (error) {
      console.error('Get admin auction rankings error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch rankings'
      });
    }

    if (!allBids || allBids.length === 0) {
      return res.json({
        success: true,
        rankings: []
      });
    }

    // Group by bidder and get their lowest bid (reverse auction - lowest wins)
    const bidderLowestBids = {};
    allBids.forEach(bid => {
      const bidderId = bid.bidder_id;
      if (!bidderLowestBids[bidderId] || bid.amount < bidderLowestBids[bidderId].amount) {
        bidderLowestBids[bidderId] = {
          bidder_id: bidderId,
          amount: bid.amount,
          bid_time: bid.bid_time,
          user_id: bid.user_id,
          name: bid.name,
          company: bid.company
        };
      }
    });

    // Convert to array and sort by amount (lowest first = rank 1)
    const rankings = Object.values(bidderLowestBids)
      .sort((a, b) => a.amount - b.amount);

    res.json({
      success: true,
      rankings,
      current_time_sl: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
    });

  } catch (error) {
    console.error('Get admin auction rankings error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// UPDATED: getAllAuctionsAdmin to include approval info
const getAllAuctionsAdmin = async (req, res) => {
    try {
        // Get all auctions with invited bidders' names and approval info
        const { data: auctions, error } = await query(`
            SELECT 
                a.auction_id AS AuctionID,
                a.title AS Title,
                a.category,
                a.sbu,
                CONCAT(a.auction_date, ' ', a.start_time) AS DateTime,
                a.duration_minutes AS Duration,
                a.status AS Status,
                a.approved_by,
                a.approved_at,
                a.rejected_by,
                a.rejected_at,
                GROUP_CONCAT(u.name SEPARATOR ', ') AS InvitedBidders
            FROM 
                auctions a
            LEFT JOIN 
                auction_bidders ab ON a.id = ab.auction_id
            LEFT JOIN 
                users u ON ab.bidder_id = u.id
            GROUP BY 
                a.id
            ORDER BY 
                a.auction_date DESC, a.start_time DESC
        `);

        if (error) {
            console.error('Error fetching auctions:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch auctions'
            });
        }

        // Add calculated status for each auction
        const auctionsWithStatus = auctions.map(auction => {
          // Parse the DateTime back to separate date/time for status calculation
          const [date, time] = auction.DateTime.split(' ');
          const calculatedStatus = getAuctionStatus({
            auction_date: date,
            start_time: time,
            duration_minutes: auction.Duration,
            status: auction.Status
          });
          
          return {
            AuctionID: auction.AuctionID,
            Title: auction.Title,
            Category: auction.category,
            SBU: auction.sbu,
            DateTime: auction.DateTime,
            Duration: `${auction.Duration} minutes`,
            Status: calculatedStatus.charAt(0).toUpperCase() + calculatedStatus.slice(1),
            InvitedBidders: auction.InvitedBidders || 'No bidders invited',
            calculated_status: calculatedStatus,
            approved_by: auction.approved_by,
            approved_at: auction.approved_at,
            rejected_by: auction.rejected_by,
            rejected_at: auction.rejected_at
          };
        });

        res.status(200).json({
            success: true,
            auctions: auctionsWithStatus,
            current_time_sl: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
        });
    } catch (error) {
        console.error('Error fetching auctions:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};


// Updated approveAuction function with proper foreign key handling and email notifications

const approveAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;

    console.log('Approve auction request:', { auctionId, user: req.user });

    // Check if user is system admin
    if (req.user.role !== 'system_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only System Administrator can approve auctions'
      });
    }

    // Get the actual system admin user ID from database
    const { data: sysAdminUser, error: userError } = await query(
      'SELECT id, name, user_id FROM users WHERE user_id = ? AND role = ?',
      ['SYSADMIN', 'system_admin']
    );

    if (userError || !sysAdminUser || sysAdminUser.length === 0) {
      console.error('System admin user not found:', userError);
      return res.status(500).json({
        success: false,
        error: 'System administrator user not found in database'
      });
    }

    const approvedByUserId = sysAdminUser[0].id; // This is the UUID from users table

    // Get auction with invited bidders
    const { data: auction, error: fetchError } = await query(`
      SELECT a.*, 
             GROUP_CONCAT(ab.bidder_id) as bidder_ids
      FROM auctions a
      LEFT JOIN auction_bidders ab ON a.id = ab.auction_id
      WHERE (a.id = ? OR a.auction_id = ?)
      GROUP BY a.id
    `, [auctionId, auctionId]);

    if (fetchError || !auction || auction.length === 0) {
      console.error('Auction not found:', fetchError);
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    const auctionData = auction[0];

    // Check if auction is in pending status
    if (auctionData.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot approve auction with status: ${auctionData.status}`
      });
    }

    // Update auction status to approved with correct user ID
    const { error: updateError } = await query(
      `UPDATE auctions SET 
        status = 'approved', 
        approved_by = ?, 
        approved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?`,
      [approvedByUserId, auctionData.id] // Use the UUID, not the name
    );

    if (updateError) {
      console.error('Error approving auction:', updateError);
      throw updateError;
    }

    console.log('Auction approved successfully:', auctionData.auction_id);

    // Send email notifications to invited bidders ONLY after approval
    if (auctionData.bidder_ids) {
      try {
        const bidderIds = auctionData.bidder_ids.split(',');
        
        // Get bidder details for email
        const { data: bidders, error: biddersError } = await query(
          `SELECT email, name FROM users WHERE id IN (${bidderIds.map(() => '?').join(',')}) AND role = 'bidder' AND is_active = TRUE`,
          bidderIds
        );
        
        if (!biddersError && bidders && bidders.length > 0) {
          // Format date/time for email in Sri Lanka timezone
          const formattedDateTime = moment.tz(`${auctionData.auction_date} ${auctionData.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo')
            .format('MMMM DD, YYYY at hh:mm A');
          
          const emailPromises = bidders.map(async (bidder) => {
            const emailHTML = `
              <h2>🎯 Auction Approved & Ready - Anunine Holdings Pvt Ltd</h2>
              <p>Dear ${bidder.name},</p>
              <p><strong>Great news!</strong> The auction you were invited to participate in has been <span style="color: #28a745; font-weight: bold;">APPROVED</span> and is now ready for bidding:</p>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #007bff; margin: 20px 0;">
                <p><strong>📋 Title:</strong> ${auctionData.title}</p>
                <p><strong>🏷️ Category:</strong> ${auctionData.category}</p>
                <p><strong>🏢 SBU:</strong> ${auctionData.sbu}</p>
                <p><strong>📅 Date & Time:</strong> ${formattedDateTime} (Sri Lanka Time)</p>
                <p><strong>⏱️ Duration:</strong> ${auctionData.duration_minutes} minutes</p>
                ${auctionData.special_notices ? `<p><strong>📝 Special Notices:</strong> ${auctionData.special_notices}</p>` : ''}
              </div>
              
              <p><strong>✅ Status:</strong> <span style="color: #28a745;">APPROVED - Ready for participation</span></p>
              <p><strong>👤 Created by:</strong> ${auctionData.created_by}</p>
              <p><strong>✅ Approved by:</strong> ${sysAdminUser[0].name}</p>
              
              <div style="background-color: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>🚀 Next Steps:</strong></p>
                <ul>
                  <li>Please login to the auction system before the scheduled time</li>
                  <li>Be ready to participate when the auction goes live</li>
                  <li>Remember: This is a reverse auction - lowest bid wins!</li>
                </ul>
              </div>
              
              <p>Please ensure you're logged in and ready to participate at the scheduled time.</p>
              <br>
              <p>Best regards,<br>
              <strong>Anunine Holdings Pvt Ltd</strong><br>
              E-Auction System</p>
              
              <hr style="margin: 20px 0;">
              <p style="font-size: 12px; color: #666;">
                This is an automated notification. Please do not reply to this email.
              </p>
            `;
            
            try {
              await sendEmail(
                bidder.email, 
                `🎯 Auction APPROVED & Ready: ${auctionData.title}`, 
                emailHTML
              );
              console.log(`Approval email sent to ${bidder.email}`);
            } catch (emailError) {
              console.error(`Failed to send approval email to ${bidder.email}:`, emailError);
            }
          });

          await Promise.all(emailPromises);
          console.log(`Approval emails sent to ${bidders.length} bidders`);
        }
      } catch (emailError) {
        console.error('Error in approval email sending process:', emailError);
        // Don't fail the approval for email errors
      }
    }

    res.json({
      success: true,
      message: 'Auction approved successfully and bidders notified',
      auction_id: auctionData.auction_id
    });

  } catch (error) {
    console.error('Approve auction error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};



// Reject auction function
const rejectAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { reason } = req.body;
    const rejectedBy = req.user.name || req.user.user_id;

    console.log('Reject auction request:', { auctionId, rejectedBy, reason });

    // Check if user is system admin
    if (req.user.role !== 'system_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only System Administrator can reject auctions'
      });
    }

    // Get auction
    const { data: auction, error: fetchError } = await query(
      'SELECT * FROM auctions WHERE id = ? OR auction_id = ?',
      [auctionId, auctionId]
    );

    if (fetchError || !auction || auction.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    const auctionData = auction[0];

    // Check if auction is in pending or approved status
    if (auctionData.status !== 'pending' && auctionData.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: `Cannot reject auction with status: ${auctionData.status}`
      });
    }

    // Update auction status to rejected
    const rejectionNotes = reason ? `Rejected: ${reason}` : null;
    const currentSpecialNotices = auctionData.special_notices;
    const updatedSpecialNotices = rejectionNotes 
      ? (currentSpecialNotices ? `${currentSpecialNotices}\n\n${rejectionNotes}` : rejectionNotes)
      : currentSpecialNotices;

    const { error: updateError } = await query(
      `UPDATE auctions SET 
        status = 'rejected', 
        rejected_by = ?, 
        rejected_at = CURRENT_TIMESTAMP,
        special_notices = ?,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?`,
      [rejectedBy, updatedSpecialNotices, auctionData.id]
    );

    if (updateError) {
      console.error('Error rejecting auction:', updateError);
      throw updateError;
    }

    console.log('Auction rejected successfully:', auctionData.auction_id);

    res.json({
      success: true,
      message: 'Auction rejected successfully',
      auction_id: auctionData.auction_id
    });

  } catch (error) {
    console.error('Reject auction error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


const updateAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { 
      title, 
      auction_date, 
      start_time, 
      duration_minutes, 
      special_notices, 
      selected_bidders,
      category,
      sbu
    } = req.body;

    console.log('Update auction request:', { auctionId, body: req.body });

    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    // Get the auction to check its current status
    const { data: existingAuction, error: fetchError } = await query(
      'SELECT * FROM auctions WHERE id = ? OR auction_id = ?',
      [auctionId, auctionId]
    );

    if (fetchError || !existingAuction || existingAuction.length === 0) {
      console.error('Auction not found:', fetchError);
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    const auction = existingAuction[0];
    
    // Check if auction can be updated (not started yet)
    const auctionStatus = getAuctionStatus(auction);
    if (auctionStatus === 'live' || auctionStatus === 'ended') {
      return res.status(400).json({
        success: false,
        error: 'Cannot update auction that has already started or ended'
      });
    }

    // Validate required fields
    if (!title || !auction_date || !start_time || !duration_minutes || 
        !selected_bidders?.length || !category || !sbu) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    // Validate SBU
    const allowedSBUs = ['SBU1', 'SBU2', 'SBU3', 'SBU4'];
    if (!allowedSBUs.includes(sbu)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid SBU value'
      });
    }

    // Validate auction date/time is in future
    const nowSL = getCurrentSLTime();
    const auctionDateTime = moment.tz(`${auction_date} ${start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
    
    if (!auctionDateTime.isValid() || auctionDateTime.isBefore(nowSL)) {
      return res.status(400).json({
        success: false,
        error: 'Auction date and time must be in the future'
      });
    }

    // Validate selected bidders
    const { data: validBidders, error: biddersValidationError } = await query(
      `SELECT id FROM users WHERE id IN (${selected_bidders.map(() => '?').join(',')}) AND role = 'bidder' AND is_active = TRUE`,
      selected_bidders
    );
    
    if (biddersValidationError || validBidders.length !== selected_bidders.length) {
      return res.status(400).json({
        success: false,
        error: 'One or more selected bidders are invalid or inactive'
      });
    }

    // Update auction with transaction
    const result = await transaction(async (connection) => {
      // Update auction details
      const newStatus = getAuctionStatus({ 
        auction_date, 
        start_time, 
        duration_minutes 
      });

      await connection.execute(
        `UPDATE auctions SET 
          title = ?, 
          auction_date = ?, 
          start_time = ?, 
          duration_minutes = ?, 
          special_notices = ?, 
          status = ?,
          category = ?,
          sbu = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          title, 
          auction_date, 
          start_time, 
          duration_minutes, 
          special_notices || null,
          newStatus,
          category,
          sbu,
          auction.id
        ]
      );

      // Update invited bidders - remove existing and add new ones
      await connection.execute(
        'DELETE FROM auction_bidders WHERE auction_id = ?',
        [auction.id]
      );

      if (selected_bidders.length > 0) {
        const bidderInvites = selected_bidders.map(bidderId => [auction.id, bidderId]);
        const placeholders = bidderInvites.map(() => '(?, ?)').join(', ');
        const flatValues = bidderInvites.flat();
        
        await connection.execute(
          `INSERT INTO auction_bidders (auction_id, bidder_id) VALUES ${placeholders}`,
          flatValues
        );
      }

      // Get updated auction
      const [updatedAuction] = await connection.execute(
        'SELECT * FROM auctions WHERE id = ?',
        [auction.id]
      );

      return updatedAuction[0];
    });

    if (result.error) {
      console.error('Transaction error:', result.error);
      throw result.error;
    }

    console.log('Auction updated successfully:', result.data);

    res.json({
      success: true,
      auction: result.data,
      message: 'Auction updated successfully'
    });

  } catch (error) {
    console.error('Update auction error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete auction
 * Only allows deletion if auction hasn't started yet or has no bids
 */
const deleteAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;

    console.log('Delete auction request:', auctionId);

    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    // Get the auction to check its current status
    const { data: existingAuction, error: fetchError } = await query(
      'SELECT * FROM auctions WHERE id = ? OR auction_id = ?',
      [auctionId, auctionId]
    );

    if (fetchError || !existingAuction || existingAuction.length === 0) {
      console.error('Auction not found:', fetchError);
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    const auction = existingAuction[0];
    
    // Check if auction can be deleted
    const auctionStatus = getAuctionStatus(auction);
    if (auctionStatus === 'live') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete a live auction'
      });
    }

    // Check if there are any bids for this auction
    const { data: existingBids, error: bidsError } = await query(
      'SELECT COUNT(*) as bid_count FROM bids WHERE auction_id = ?',
      [auction.id]
    );

    if (bidsError) {
      console.error('Error checking existing bids:', bidsError);
      return res.status(500).json({
        success: false,
        error: 'Error checking auction bids'
      });
    }

    if (existingBids[0].bid_count > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete auction that has received bids'
      });
    }

    // Delete auction with transaction (cascade will handle related records)
    const result = await transaction(async (connection) => {
      // Delete auction (cascade will handle auction_bidders)
      await connection.execute(
        'DELETE FROM auctions WHERE id = ?',
        [auction.id]
      );

      return { deleted: true };
    });

    if (result.error) {
      console.error('Transaction error:', result.error);
      throw result.error;
    }

    console.log('Auction deleted successfully:', auction.auction_id);

    res.json({
      success: true,
      message: 'Auction deleted successfully'
    });

  } catch (error) {
    console.error('Delete auction error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get auction statistics for admin view
 */
const getAuctionStatistics = async (req, res) => {
  try {
    const { auctionId } = req.params;

    console.log('Get auction statistics request:', auctionId);

    // Get auction details
    const { data: auction, error: auctionError } = await query(
      'SELECT * FROM auctions WHERE id = ? OR auction_id = ?',
      [auctionId, auctionId]
    );

    if (auctionError || !auction || auction.length === 0) {
      console.error('Auction not found:', auctionError);
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    const auctionData = auction[0];

    // Get invited bidders count
    const { data: invitedCount } = await query(
      'SELECT COUNT(*) as count FROM auction_bidders WHERE auction_id = ?',
      [auctionData.id]
    );

    // Get total bids count
    const { data: totalBids } = await query(
      'SELECT COUNT(*) as count FROM bids WHERE auction_id = ?',
      [auctionData.id]
    );

    // Get unique bidders count (who actually placed bids)
    const { data: activeBidders } = await query(
      'SELECT COUNT(DISTINCT bidder_id) as count FROM bids WHERE auction_id = ?',
      [auctionData.id]
    );

    // Get bid statistics
    const { data: bidStats } = await query(
      `SELECT 
        MIN(amount) as lowest_bid,
        MAX(amount) as highest_bid,
        AVG(amount) as average_bid,
        COUNT(*) as total_bids
      FROM bids WHERE auction_id = ?`,
      [auctionData.id]
    );

    // Get time-based bid distribution (bids per hour)
    const { data: bidDistribution } = await query(
      `SELECT 
        HOUR(bid_time) as hour,
        COUNT(*) as bid_count
      FROM bids 
      WHERE auction_id = ?
      GROUP BY HOUR(bid_time)
      ORDER BY hour`,
      [auctionData.id]
    );

    // Calculate auction status and timing info
    const currentStatus = getAuctionStatus(auctionData);
    const nowSL = getCurrentSLTime();
    const startDateTime = moment.tz(`${auctionData.auction_date} ${auctionData.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
    const endDateTime = startDateTime.clone().add(auctionData.duration_minutes, 'minutes');

    const statistics = {
      auction_info: {
        id: auctionData.auction_id,
        title: auctionData.title,
        status: currentStatus,
        category: auctionData.category,
        sbu: auctionData.sbu
      },
      participation: {
        invited_bidders: invitedCount[0].count,
        active_bidders: activeBidders[0].count,
        participation_rate: invitedCount[0].count > 0 
          ? ((activeBidders[0].count / invitedCount[0].count) * 100).toFixed(2)
          : 0
      },
      bidding: {
        total_bids: totalBids[0].count,
        lowest_bid: bidStats[0].lowest_bid,
        highest_bid: bidStats[0].highest_bid,
        average_bid: bidStats[0].average_bid ? parseFloat(bidStats[0].average_bid).toFixed(2) : null,
        bid_distribution: bidDistribution
      },
      timing: {
        start_time: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
        end_time: endDateTime.format('YYYY-MM-DD HH:mm:ss'),
        duration_minutes: auctionData.duration_minutes,
        time_remaining: currentStatus === 'live' ? endDateTime.diff(nowSL, 'milliseconds') : null
      }
    };

    res.json({
      success: true,
      statistics,
      current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss')
    });

  } catch (error) {
    console.error('Get auction statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
createAuction,
getLiveAuction,
isAuctionLive,
getAuctionStatus,
getAllAuctions,
getAdminLiveAuctions,
updateAuctionStatuses,
getAuctionResults,
getAuction,
getLiveRankings,
getAdminAuctionRankings,
getAllAuctionsAdmin,
approveAuction,
rejectAuction,
updateAuction,
deleteAuction,
getAuctionStatistics,
getCurrentSLTime,  // Add this line - it was missing
};