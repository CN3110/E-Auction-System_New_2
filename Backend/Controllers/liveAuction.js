const { query } = require('../Config/database');
const moment = require('moment-timezone');

// Helper function to get current Sri Lanka time
const getCurrentSLTime = () => {
  return moment().tz('Asia/Colombo');
};

// Helper function to check if auction should be live
const isAuctionLive = (auction) => {
  try {
    if (!auction || !auction.auction_date || !auction.start_time) {
      return false;
    }

    const nowSL = getCurrentSLTime();
    
    // Handle different date formats
    let auctionDate = auction.auction_date;
    let auctionTime = auction.start_time;
    
    if (auctionDate instanceof Date) {
      auctionDate = moment(auctionDate).format('YYYY-MM-DD');
    }
    
    // Convert to string and clean time format
    auctionDate = String(auctionDate);
    auctionTime = String(auctionTime);
    
    if (auctionTime.includes('.')) {
      auctionTime = auctionTime.split('.')[0];
    }
    
    // Create start and end datetime
    const startDateTime = moment.tz(`${auctionDate} ${auctionTime}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
    const endDateTime = startDateTime.clone().add(auction.duration_minutes || 0, 'minutes');
    
    if (!startDateTime.isValid()) {
      console.error(`Invalid datetime for auction ${auction.auction_id}: ${auctionDate} ${auctionTime}`);
      return false;
    }
    
    // Check if auction is approved and within time bounds
    const isApproved = auction.status === 'approved' || auction.status === 'live';
    const isWithinTimeRange = nowSL.isBetween(startDateTime, endDateTime, null, '[]');
    
    console.log(`isAuctionLive check for ${auction.auction_id}:`, {
      status: auction.status,
      isApproved,
      nowSL: nowSL.format('YYYY-MM-DD HH:mm:ss'),
      startDateTime: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
      endDateTime: endDateTime.format('YYYY-MM-DD HH:mm:ss'),
      isWithinTimeRange,
      finalResult: isApproved && isWithinTimeRange
    });
    
    return isApproved && isWithinTimeRange;
  } catch (error) {
    console.error('Error checking if auction is live:', error);
    return false;
  }
};

// Get live auctions for bidders (only auctions they are invited to)
const getLiveAuctionsForBidder = async (req, res) => {
  try {
    const bidderId = req.user.id;
    const nowSL = getCurrentSLTime();
    
    console.log('=== GETTING LIVE AUCTIONS FOR BIDDER ===');
    console.log('Bidder ID:', bidderId);
    console.log('Current SL time:', nowSL.format('YYYY-MM-DD HH:mm:ss'));

    // Get ALL auctions the bidder is invited to with approved status
    const { data: invitedAuctions, error: invitedError } = await query(`
      SELECT a.*, 
             u.name as bidder_name,
             u.user_id as bidder_user_id,
             ab.invited_at
      FROM auctions a
      JOIN auction_bidders ab ON a.id = ab.auction_id
      JOIN users u ON ab.bidder_id = u.id
      WHERE ab.bidder_id = ? 
        AND a.status IN ('approved', 'live')
      ORDER BY a.auction_date ASC, a.start_time ASC
    `, [bidderId]);

    if (invitedError) {
      console.error('Error fetching invited auctions:', invitedError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch invited auctions'
      });
    }

    console.log(`Found ${invitedAuctions?.length || 0} approved/live invited auctions`);
    
    if (!invitedAuctions || invitedAuctions.length === 0) {
      console.log('No approved auctions found for this bidder');
      
      // Check if there are pending auctions
      const { data: pendingAuctions } = await query(`
        SELECT COUNT(*) as count FROM auctions a
        JOIN auction_bidders ab ON a.id = ab.auction_id
        WHERE ab.bidder_id = ? AND a.status = 'pending'
      `, [bidderId]);

      let message = 'No approved auctions found';
      if (pendingAuctions && pendingAuctions[0].count > 0) {
        message = `Found ${pendingAuctions[0].count} pending auction(s) awaiting approval`;
      }

      return res.json({
        success: true,
        count: 0,
        auctions: [],
        current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss'),
        message
      });
    }

    // Filter for currently live auctions
    const liveAuctions = [];
    const futureAuctions = [];
    const pastAuctions = [];
    
    for (const auction of invitedAuctions) {
      console.log(`\n--- Checking auction ${auction.auction_id} for live status ---`);
      
      // FIX: Handle the date properly - convert ISO date to YYYY-MM-DD format
      let auctionDateStr;
      if (auction.auction_date instanceof Date) {
        // If it's a Date object
        auctionDateStr = moment(auction.auction_date).format('YYYY-MM-DD');
      } else if (typeof auction.auction_date === 'string') {
        // If it's an ISO string, parse it first
        auctionDateStr = moment(auction.auction_date).format('YYYY-MM-DD');
      } else {
        console.error('Unexpected auction_date format:', auction.auction_date);
        continue; // Skip this auction
      }

      console.log(`Parsed auction date: ${auctionDateStr}`);
      console.log(`Start time: ${auction.start_time}`);

      // Create the start datetime in Sri Lanka timezone
      const startDateTime = moment.tz(
        `${auctionDateStr} ${auction.start_time}`, 
        'YYYY-MM-DD HH:mm:ss', 
        'Asia/Colombo'
      );

      const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
      
      console.log(`Auction: ${auction.title}`);
      console.log(`Status: ${auction.status}`);
      console.log(`Start: ${startDateTime.format('YYYY-MM-DD HH:mm:ss')}`);
      console.log(`End: ${endDateTime.format('YYYY-MM-DD HH:mm:ss')}`);
      console.log(`Current: ${nowSL.format('YYYY-MM-DD HH:mm:ss')}`);
      
      // Check if the datetime parsing was successful
      if (!startDateTime.isValid()) {
        console.error(`Invalid start datetime for auction ${auction.auction_id}`);
        continue; // Skip this auction
      }
      
      const isLive = isAuctionLive(auction);
      
      if (isLive) {
        console.log(`✅ Auction ${auction.auction_id} is LIVE`);
        
        // Add time remaining and other live info
        const timeRemaining = endDateTime.diff(nowSL, 'milliseconds');
        liveAuctions.push({
          ...auction,
          calculated_status: 'live',
          is_live: true,
          time_remaining_ms: Math.max(0, timeRemaining),
          start_datetime_sl: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
          end_datetime_sl: endDateTime.format('YYYY-MM-DD HH:mm:ss'),
          time_until_end: moment.duration(Math.max(0, timeRemaining)).humanize()
        });
      } else {
        console.log(`❌ Auction ${auction.auction_id} is NOT live`);
        
        // Categorize non-live auctions
        if (nowSL.isBefore(startDateTime)) {
          const timeUntilStart = startDateTime.diff(nowSL, 'milliseconds');
          futureAuctions.push({
            ...auction,
            calculated_status: 'approved',
            is_live: false,
            time_until_start_ms: timeUntilStart,
            start_datetime_sl: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
            time_until_start: moment.duration(timeUntilStart).humanize()
          });
        } else if (nowSL.isSameOrAfter(endDateTime)) {
          pastAuctions.push({
            ...auction,
            calculated_status: 'ended',
            is_live: false,
            start_datetime_sl: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
            end_datetime_sl: endDateTime.format('YYYY-MM-DD HH:mm:ss')
          });
        }
      }
    }

    console.log(`\nFinal result: ${liveAuctions.length} live auctions found`);
    console.log(`Future auctions: ${futureAuctions.length}`);
    console.log(`Past auctions: ${pastAuctions.length}`);

    // Prepare response message
    let message = '';
    if (liveAuctions.length > 0) {
      message = `${liveAuctions.length} auction(s) are currently live`;
    } else if (futureAuctions.length > 0) {
      const nextAuction = futureAuctions[0];
      message = `No auctions are currently live. Next auction "${nextAuction.title}" starts in ${nextAuction.time_until_start}`;
    } else if (pastAuctions.length > 0) {
      message = 'No auctions are currently live. All approved auctions have ended.';
    } else {
      message = 'No live auctions found.';
    }

    res.json({
      success: true,
      count: liveAuctions.length,
      auctions: liveAuctions,
      future_auctions: futureAuctions,
      past_auctions: pastAuctions,
      current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss'),
      message,
      debug: {
        bidderId,
        totalInvitedAuctions: invitedAuctions.length,
        liveAuctionCount: liveAuctions.length,
        futureAuctionCount: futureAuctions.length,
        pastAuctionCount: pastAuctions.length
      }
    });

  } catch (error) {
    console.error('Error fetching live auctions for bidder:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch live auctions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getLiveAuctionsForAdmin = async (req, res) => {
  try {
    const nowSL = getCurrentSLTime();
    console.log('Admin checking live auctions at SL time:', nowSL.format('YYYY-MM-DD HH:mm:ss'));

    const { data: auctions, error } = await query(`
      SELECT a.*,
             COUNT(ab.bidder_id) as invited_bidder_count,
             COUNT(DISTINCT b.bidder_id) as active_bidder_count,
             COUNT(b.id) as total_bids,
             MIN(b.amount) as lowest_bid,
             MAX(b.amount) as highest_bid
      FROM auctions a
      LEFT JOIN auction_bidders ab ON a.id = ab.auction_id
      LEFT JOIN bids b ON a.id = b.auction_id
      WHERE a.status IN ('approved', 'live')
      GROUP BY a.id
      ORDER BY a.auction_date ASC, a.start_time ASC
    `);

    if (error) {
      console.error('Error fetching auctions:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch auctions' });
    }

    const liveAuctions = [];

    for (const auction of auctions) {
      console.log(`\n--- Processing auction ${auction.auction_id} for admin ---`);
      console.log('Raw auction_date:', auction.auction_date);
      console.log('Raw start_time:', auction.start_time);
      
      // FIX: Properly handle the date parsing
      let auctionDateStr;
      if (auction.auction_date instanceof Date) {
        // If it's a Date object
        auctionDateStr = moment(auction.auction_date).format('YYYY-MM-DD');
      } else if (typeof auction.auction_date === 'string') {
        // If it's an ISO string (like "2025-08-18T18:30:00.000Z"), parse it first
        const parsedDate = moment(auction.auction_date);
        if (parsedDate.isValid()) {
          auctionDateStr = parsedDate.format('YYYY-MM-DD');
        } else {
          console.error('Invalid auction_date format:', auction.auction_date);
          continue; // Skip this auction
        }
      } else {
        console.error('Unexpected auction_date format:', auction.auction_date, typeof auction.auction_date);
        continue; // Skip this auction
      }

      // Clean up start_time format
      let startTimeStr = String(auction.start_time);
      if (startTimeStr.includes('.')) {
        startTimeStr = startTimeStr.split('.')[0];
      }

      console.log('Parsed auction date:', auctionDateStr);
      console.log('Cleaned start time:', startTimeStr);

      // Create start and end datetime
      const startDateTime = moment.tz(
        `${auctionDateStr} ${startTimeStr}`,
        'YYYY-MM-DD HH:mm:ss',
        'Asia/Colombo'
      );

      if (!startDateTime.isValid()) {
        console.error(`Invalid start datetime for auction ${auction.auction_id}:`, `${auctionDateStr} ${startTimeStr}`);
        continue; // Skip this auction
      }

      const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');

      console.log('Start DateTime:', startDateTime.format('YYYY-MM-DD HH:mm:ss'));
      console.log('End DateTime:', endDateTime.format('YYYY-MM-DD HH:mm:ss'));
      console.log('Current Time:', nowSL.format('YYYY-MM-DD HH:mm:ss'));

      // Check if this auction is actually live
      if (isAuctionLive(auction)) {
        console.log(`✅ Auction ${auction.auction_id} is LIVE for admin view`);
        
        const timeRemaining = endDateTime.diff(nowSL, 'milliseconds');

        liveAuctions.push({
          ...auction,
          calculated_status: 'live',
          is_live: true,
          time_remaining_ms: Math.max(0, timeRemaining),
          start_datetime_sl: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
          end_datetime_sl: endDateTime.format('YYYY-MM-DD HH:mm:ss'),
          time_until_end: moment.duration(Math.max(0, timeRemaining)).humanize(),
          invited_bidders: auction.invited_bidder_count || 0,
          active_bidders: auction.active_bidder_count || 0,
          total_bids: auction.total_bids || 0,
          lowest_bid: auction.lowest_bid,
          highest_bid: auction.highest_bid,
          participation_rate:
            auction.invited_bidder_count > 0
              ? ((auction.active_bidder_count / auction.invited_bidder_count) * 100).toFixed(2)
              : 0
        });
      } else {
        console.log(`❌ Auction ${auction.auction_id} is NOT live for admin view`);
      }
    }

    console.log(`Found ${liveAuctions.length} currently live auctions for admin`);

    res.json({
      success: true,
      count: liveAuctions.length,
      auctions: liveAuctions,
      current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss'),
      message: liveAuctions.length > 0 
        ? `${liveAuctions.length} auction(s) are currently live`
        : 'No auctions are currently live'
    });
  } catch (error) {
    console.error('Get admin live auctions error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get live auction details for specific auction
const getLiveAuctionDetails = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const nowSL = getCurrentSLTime();

    console.log('Getting live auction details:', { auctionId, userId, userRole });

    // Get auction details with bidder information
    const { data: auction, error: auctionError } = await query(`
      SELECT a.*,
             COUNT(DISTINCT ab.bidder_id) as invited_bidder_count,
             COUNT(DISTINCT b.bidder_id) as active_bidder_count,
             COUNT(b.id) as total_bids,
             MIN(b.amount) as lowest_bid,
             MAX(b.amount) as highest_bid,
             AVG(b.amount) as average_bid
      FROM auctions a 
      LEFT JOIN auction_bidders ab ON a.id = ab.auction_id
      LEFT JOIN bids b ON a.id = b.auction_id
      WHERE (a.id = ? OR a.auction_id = ?)
      GROUP BY a.id
    `, [auctionId, auctionId]);

    if (auctionError || !auction || auction.length === 0) {
      console.error('Auction not found:', auctionError);
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    const auctionData = auction[0];

    // Check if user is authorized to view this auction
    if (userRole === 'bidder') {
      // Check if bidder is invited to this auction
      const { data: invitation } = await query(
        'SELECT 1 FROM auction_bidders WHERE auction_id = ? AND bidder_id = ?',
        [auctionData.id, userId]
      );

      if (!invitation || invitation.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'You are not invited to this auction'
        });
      }
    }

    // Check if auction is currently live
    const isLive = isAuctionLive(auctionData);
    
    if (!isLive) {
      const startDateTime = moment.tz(`${auctionData.auction_date} ${auctionData.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
      const endDateTime = startDateTime.clone().add(auctionData.duration_minutes, 'minutes');
      
      let message = 'Auction is not currently live.';
      if (nowSL.isBefore(startDateTime)) {
        const timeUntilStart = startDateTime.diff(nowSL, 'milliseconds');
        message = `Auction starts in ${moment.duration(timeUntilStart).humanize()}`;
      } else if (nowSL.isSameOrAfter(endDateTime)) {
        message = 'Auction has ended.';
      }

      return res.status(400).json({
        success: false,
        error: message,
        auction_status: auctionData.status,
        is_live: false,
        start_time: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
        current_time: nowSL.format('YYYY-MM-DD HH:mm:ss')
      });
    }

    // Get current rankings (lowest bid wins - reverse auction)
    const { data: allBids, error: bidsError } = await query(`
      SELECT b.bidder_id, b.amount, b.bid_time,
             u.user_id, u.name, u.company
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      WHERE b.auction_id = ? 
      ORDER BY b.amount ASC, b.bid_time ASC
    `, [auctionData.id]);

    let rankings = [];
    if (!bidsError && allBids && allBids.length > 0) {
      // Group by bidder and get their lowest bid
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

      // Create sorted rankings array
      rankings = Object.values(bidderLowestBids)
        .sort((a, b) => {
          if (a.amount !== b.amount) {
            return a.amount - b.amount; // Lowest first
          }
          return new Date(a.bid_time) - new Date(b.bid_time); // Earliest first if tie
        })
        .map((bidder, index) => ({
          rank: index + 1,
          bidder_id: bidder.bidder_id,
          user_id: bidder.user_id,
          name: bidder.name,
          company: bidder.company,
          amount: bidder.amount,
          bid_time: bidder.bid_time,
          is_leader: index === 0
        }));
    }

    // Get invited bidders list
    const { data: invitedBidders } = await query(`
      SELECT u.id as bidder_id, u.user_id, u.name, u.company,
             ab.invited_at,
             CASE WHEN b.bidder_id IS NOT NULL THEN TRUE ELSE FALSE END as has_bid
      FROM auction_bidders ab
      JOIN users u ON ab.bidder_id = u.id
      LEFT JOIN (SELECT DISTINCT bidder_id FROM bids WHERE auction_id = ?) b ON u.id = b.bidder_id
      WHERE ab.auction_id = ?
      ORDER BY u.name
    `, [auctionData.id, auctionData.id]);

    // Calculate time remaining
    const startDateTime = moment.tz(`${auctionData.auction_date} ${auctionData.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
    const endDateTime = startDateTime.clone().add(auctionData.duration_minutes, 'minutes');
    const timeRemaining = endDateTime.diff(nowSL, 'milliseconds');

    // Prepare response data
    const liveAuctionData = {
      // Basic auction info
      id: auctionData.id,
      auction_id: auctionData.auction_id,
      title: auctionData.title,
      category: auctionData.category,
      sbu: auctionData.sbu,
      status: 'live',
      is_live: true,
      
      // Timing information
      start_datetime_sl: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
      end_datetime_sl: endDateTime.format('YYYY-MM-DD HH:mm:ss'),
      duration_minutes: auctionData.duration_minutes,
      time_remaining_ms: Math.max(0, timeRemaining),
      time_until_end: moment.duration(timeRemaining).humanize(),
      
      // Bidding statistics
      invited_bidders_count: auctionData.invited_bidder_count || 0,
      active_bidders_count: auctionData.active_bidder_count || 0,
      total_bids: auctionData.total_bids || 0,
      lowest_bid: auctionData.lowest_bid,
      highest_bid: auctionData.highest_bid,
      average_bid: auctionData.average_bid ? parseFloat(auctionData.average_bid).toFixed(2) : null,
      
      // Participation data
      participation_rate: auctionData.invited_bidder_count > 0 
        ? ((auctionData.active_bidder_count / auctionData.invited_bidder_count) * 100).toFixed(2)
        : 0,
      
      // Current rankings
      rankings: rankings || [],
      current_leader: rankings.length > 0 ? rankings[0] : null,
      
      // Special notices
      special_notices: auctionData.special_notices,
      
      // Admin-only data
      ...(userRole === 'admin' || userRole === 'system_admin' ? {
        invited_bidders: invitedBidders || [],
        created_by: auctionData.created_by,
        created_at: auctionData.created_at
      } : {}),
      
      // Bidder-specific data
      ...(userRole === 'bidder' ? {
        user_rank: rankings.find(r => r.bidder_id === userId)?.rank || null,
        user_best_bid: rankings.find(r => r.bidder_id === userId)?.amount || null,
        is_user_leading: rankings.length > 0 && rankings[0].bidder_id === userId
      } : {})
    };

    res.json({
      success: true,
      auction: liveAuctionData,
      current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss'),
      message: `Live auction data retrieved successfully. ${timeRemaining > 0 ? `Time remaining: ${moment.duration(timeRemaining).humanize()}` : 'Auction ending soon!'}`
    });

  } catch (error) {
    console.error('Get live auction details error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get live auction rankings - FIXED reverse auction logic
const getLiveAuctionRankings = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    console.log('Getting live auction rankings:', { auctionId, userId, userRole });

    // 1. Find auction (UUID or auction_id)
    // 1. Find auction (UUID or auction_id)
const { data: auctions, error: auctionError } = await query(
  `SELECT * 
   FROM auctions 
   WHERE (id = ? OR auction_id = ?) 
     AND status IN ('approved','live') 
   LIMIT 1`,
  [auctionId, auctionId]
);

if (auctionError) {
  console.error('DB error:', auctionError);
  return res.status(500).json({ success: false, error: 'Database error' });
}

const auction = auctions?.[0];
if (!auction) {
  return res.status(404).json({ success: false, error: 'Auction not found' });
}


    // 2. Check if auction is live
    if (!isAuctionLive(auction)) {
      return res.status(400).json({ success: false, error: 'Auction is not currently live' });
    }

    // 3. If bidder → verify invitation
    if (userRole === 'bidder') {
      const [invited] = await query(
        'SELECT 1 FROM auction_bidders WHERE auction_id = ? AND bidder_id = ?',
        [auction.id, userId]
      );
      if (!invited) {
        return res.status(403).json({ success: false, error: 'You are not invited to this auction' });
      }
    }

   // 4. Get lowest bid per bidder (reverse auction logic)
const { data: bidsData, error: bidsError } = await query(
  `SELECT b.bidder_id, b.amount, b.bid_time,
          u.user_id, u.name, u.company
   FROM bids b
   JOIN users u ON b.bidder_id = u.id
   INNER JOIN (
     SELECT bidder_id, MIN(amount) AS min_amount
     FROM bids
     WHERE auction_id = ?
     GROUP BY bidder_id
   ) lb ON b.bidder_id = lb.bidder_id AND b.amount = lb.min_amount
   WHERE b.auction_id = ?
   ORDER BY b.amount ASC, b.bid_time ASC`,
  [auction.id, auction.id]
);

if (bidsError) {
  console.error('Get rankings error:', bidsError);
  return res.status(500).json({ success: false, error: 'Failed to fetch rankings' });
}

const allBids = bidsData || [];   // ✅ make sure it's always an array


    if (!allBids || allBids.length === 0) {
      return res.json({
        success: true,
        auction_id: auction.auction_id,
        auction_title: auction.title,
        rankings: [],
        total_bidders: 0,
        current_leader: null,
        user_rank: null,
        user_best_bid: null,
        is_user_leading: false,
        message: 'No bids placed yet',
        current_time_sl: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
      });
    }

    // 5. Format rankings
    const rankings = allBids.map((bid, index) => ({
      rank: index + 1,
      bidder_id: bid.bidder_id,
      user_id: bid.user_id,
      name: bid.name,
      company: bid.company,
      amount: bid.amount,
      bid_time: bid.bid_time,
      is_leader: index === 0
    }));

    const userRanking = rankings.find(r => r.bidder_id === userId);

    res.json({
      success: true,
      auction_id: auction.auction_id,
      auction_title: auction.title,
      rankings,
      total_bidders: rankings.length,
      current_leader: rankings[0] || null,
      lowest_bid: rankings[0]?.amount || null,
      ...(userRole === 'bidder' ? {
        user_rank: userRanking?.rank || null,
        user_best_bid: userRanking?.amount || null,
        is_user_leading: userRanking?.rank === 1 || false
      } : {}),
      current_time_sl: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss'),
      message: `Current rankings for ${auction.auction_id}`
    });

  } catch (error) {
    console.error('Get live rankings error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};




// Check auction live status
const checkAuctionLiveStatus = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const nowSL = getCurrentSLTime();

    // Get auction
    const { data: auction, error } = await query(
      'SELECT * FROM auctions WHERE id = ? OR auction_id = ?',
      [auctionId, auctionId]
    );

    if (error || !auction || auction.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    const auctionData = auction[0];
    const isLive = isAuctionLive(auctionData);
    
    const startDateTime = moment.tz(`${auctionData.auction_date} ${auctionData.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
    const endDateTime = startDateTime.clone().add(auctionData.duration_minutes, 'minutes');
    
    let timeInfo = {};
    if (isLive) {
      const timeRemaining = endDateTime.diff(nowSL, 'milliseconds');
      timeInfo = {
        time_remaining_ms: Math.max(0, timeRemaining),
        time_until_end: moment.duration(timeRemaining).humanize()
      };
    } else if (nowSL.isBefore(startDateTime)) {
      const timeUntilStart = startDateTime.diff(nowSL, 'milliseconds');
      timeInfo = {
        time_until_start_ms: timeUntilStart,
        time_until_start: moment.duration(timeUntilStart).humanize()
      };
    }

    res.json({
      success: true,
      auction_id: auctionData.auction_id,
      is_live: isLive,
      status: auctionData.status,
      start_datetime_sl: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
      end_datetime_sl: endDateTime.format('YYYY-MM-DD HH:mm:ss'),
      current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss'),
      ...timeInfo
    });

  } catch (error) {
    console.error('Check auction live status error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Add this function to your Backend/Controllers/liveAuction.js

/**
 * Get detailed auction statistics for admin view
 * @param {string} auctionId - The auction ID (either id or auction_id)
 * @returns {Object} - Auction statistics including invited, active bidders, and total bids
 */
const getAuctionStats = async (auctionId) => {
  try {
    console.log('Getting auction stats for:', auctionId);

    // Get auction details first to validate it exists
    const { data: auction, error: auctionError } = await query(
      'SELECT * FROM auctions WHERE id = ? OR auction_id = ?',
      [auctionId, auctionId]
    );

    if (auctionError || !auction || auction.length === 0) {
      throw new Error('Auction not found');
    }

    const auctionData = auction[0];

    // 1. Get count of invited bidders for this auction
    const { data: invitedBiddersResult, error: invitedError } = await query(`
      SELECT COUNT(DISTINCT ab.bidder_id) as invited_count,
             COUNT(ab.id) as total_invitations
      FROM auction_bidders ab
      WHERE ab.auction_id = ?
    `, [auctionData.id]);

    if (invitedError) {
      console.error('Error getting invited bidders count:', invitedError);
      throw new Error('Failed to get invited bidders count');
    }

    const invitedCount = invitedBiddersResult[0]?.invited_count || 0;

    // 2. Get count of actively participating bidders (bidders who have placed at least one bid)
    const { data: activeBiddersResult, error: activeError } = await query(`
      SELECT COUNT(DISTINCT b.bidder_id) as active_count
      FROM bids b
      WHERE b.auction_id = ?
    `, [auctionData.id]);

    if (activeError) {
      console.error('Error getting active bidders count:', activeError);
      throw new Error('Failed to get active bidders count');
    }

    const activeCount = activeBiddersResult[0]?.active_count || 0;

    // 3. Get total number of bids placed in this auction
    const { data: totalBidsResult, error: bidsError } = await query(`
      SELECT COUNT(b.id) as total_bids
      FROM bids b
      WHERE b.auction_id = ?
    `, [auctionData.id]);

    if (bidsError) {
      console.error('Error getting total bids count:', bidsError);
      throw new Error('Failed to get total bids count');
    }

    const totalBids = totalBidsResult[0]?.total_bids || 0;

    // 4. Get additional statistics (optional but useful)
    const { data: bidStatsResult, error: bidStatsError } = await query(`
      SELECT 
        MIN(b.amount) as lowest_bid,
        MAX(b.amount) as highest_bid,
        AVG(b.amount) as average_bid,
        COUNT(DISTINCT DATE(b.bid_time)) as active_days
      FROM bids b
      WHERE b.auction_id = ?
    `, [auctionData.id]);

    let bidStats = {};
    if (!bidStatsError && bidStatsResult && bidStatsResult.length > 0) {
      bidStats = {
        lowest_bid: bidStatsResult[0].lowest_bid,
        highest_bid: bidStatsResult[0].highest_bid,
        average_bid: bidStatsResult[0].average_bid ? parseFloat(bidStatsResult[0].average_bid).toFixed(2) : null,
        active_days: bidStatsResult[0].active_days || 0
      };
    }

    // 5. Calculate participation rate
    const participationRate = invitedCount > 0 ? ((activeCount / invitedCount) * 100).toFixed(2) : '0.00';

    // 6. Get bidder details for active participants (optional - for detailed view)
    const { data: activeBiddersDetails, error: detailsError } = await query(`
      SELECT DISTINCT 
        u.id as bidder_id,
        u.user_id,
        u.name,
        u.company,
        u.email,
        COUNT(b.id) as total_bids_by_bidder,
        MIN(b.amount) as lowest_bid_by_bidder,
        MAX(b.bid_time) as last_bid_time
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      WHERE b.auction_id = ?
      GROUP BY u.id, u.user_id, u.name, u.company, u.email
      ORDER BY COUNT(b.id) DESC, MIN(b.amount) ASC
    `, [auctionData.id]);

    const activeBiddersDetailsList = detailsError ? [] : (activeBiddersDetails || []);

    const stats = {
      auction_id: auctionData.auction_id,
      auction_title: auctionData.title,
      invited_bidders_count: invitedCount,
      active_bidders_count: activeCount,
      total_bids_count: totalBids,
      participation_rate: parseFloat(participationRate),
      ...bidStats,
      active_bidders_details: activeBiddersDetailsList,
      last_updated: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
    };

    console.log('Auction stats calculated:', stats);
    return stats;

  } catch (error) {
    console.error('Error calculating auction stats:', error);
    throw error;
  }
};

/**
 * API endpoint to get auction statistics
 */
const getAuctionStatistics = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const userRole = req.user.role;

    // Check if user is authorized (admin or system_admin only)
    if (!['admin', 'system_admin'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }

    console.log('Admin requesting auction stats:', { auctionId, userRole });

    const stats = await getAuctionStats(auctionId);

    res.json({
      success: true,
      stats: stats,
      message: 'Auction statistics retrieved successfully'
    });

  } catch (error) {
    console.error('Get auction statistics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get auction statistics',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * API endpoint to get actively participating bidders for an auction
 */
const getActivelyParticipatingBidders = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const userRole = req.user.role;

    // Check if user is authorized (admin or system_admin only)
    if (!['admin', 'system_admin'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }

    console.log('Getting actively participating bidders for auction:', auctionId);

    // Get auction details first
    const { data: auction, error: auctionError } = await query(
      'SELECT * FROM auctions WHERE id = ? OR auction_id = ?',
      [auctionId, auctionId]
    );

    if (auctionError || !auction || auction.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    const auctionData = auction[0];

    // Get actively participating bidders (bidders who have placed at least one bid)
    const { data: activeBidders, error } = await query(`
      SELECT DISTINCT 
        u.id as bidder_id,
        u.user_id,
        u.name,
        u.company,
        u.email,
        u.phone,
        COUNT(b.id) as total_bids,
        MIN(b.amount) as lowest_bid,
        MAX(b.amount) as highest_bid,
        MIN(b.bid_time) as first_bid_time,
        MAX(b.bid_time) as last_bid_time,
        AVG(b.amount) as average_bid
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      WHERE b.auction_id = ?
      GROUP BY u.id, u.user_id, u.name, u.company, u.email, u.phone
      ORDER BY COUNT(b.id) DESC, MIN(b.amount) ASC
    `, [auctionData.id]);

    if (error) {
      console.error('Error getting active bidders:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get actively participating bidders'
      });
    }

    // Get total invited bidders count for comparison
    const { data: invitedCount } = await query(`
      SELECT COUNT(DISTINCT bidder_id) as count
      FROM auction_bidders
      WHERE auction_id = ?
    `, [auctionData.id]);

    const totalInvited = invitedCount[0]?.count || 0;
    const totalActive = activeBidders?.length || 0;
    const participationRate = totalInvited > 0 ? ((totalActive / totalInvited) * 100).toFixed(2) : '0.00';

    res.json({
      success: true,
      auction: {
        id: auctionData.id,
        auction_id: auctionData.auction_id,
        title: auctionData.title
      },
      active_bidders: activeBidders || [],
      summary: {
        total_invited_bidders: totalInvited,
        actively_participating_bidders: totalActive,
        participation_rate: parseFloat(participationRate),
        total_bids_in_auction: activeBidders?.reduce((sum, bidder) => sum + bidder.total_bids, 0) || 0
      },
      current_time_sl: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss'),
      message: `Found ${totalActive} actively participating bidders out of ${totalInvited} invited bidders`
    });

  } catch (error) {
    console.error('Get actively participating bidders error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Don't forget to export these new functions
module.exports = {
  getLiveAuctionsForBidder,
  getLiveAuctionsForAdmin,
  getLiveAuctionDetails,
  getLiveAuctionRankings,
  checkAuctionLiveStatus,
  getAuctionStatistics,        // NEW
  getActivelyParticipatingBidders,  // NEW
  getAuctionStats,            // NEW helper function
  isAuctionLive,
  getCurrentSLTime
};