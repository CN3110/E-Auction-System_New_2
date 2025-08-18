// FIXED: Updated getLiveAuction function with better debugging and error handling
const getLiveAuction = async (req, res) => {
  try {
    const bidderId = req.user.id;
    const nowSL = getCurrentSLTime();
    
    console.log('=== DEBUGGING LIVE AUCTION REQUEST ===');
    console.log('Bidder ID:', bidderId);
    console.log('Current SL time:', nowSL.format('YYYY-MM-DD HH:mm:ss'));

    // STEP 1: Get ALL auctions the bidder is invited to (regardless of status)
    const { data: allInvitedAuctions, error: invitedError } = await query(`
      SELECT a.*, 
             u.name as bidder_name,
             u.user_id as bidder_user_id
      FROM auctions a
      JOIN auction_bidders ab ON a.id = ab.auction_id
      JOIN users u ON ab.bidder_id = u.id
      WHERE ab.bidder_id = ?
      ORDER BY a.auction_date DESC, a.start_time DESC
    `, [bidderId]);

    if (invitedError) {
      console.error('Error fetching invited auctions:', invitedError);
      throw new Error('Error fetching invited auctions');
    }

    console.log(`Found ${allInvitedAuctions?.length || 0} total invited auctions`);
    
    if (allInvitedAuctions && allInvitedAuctions.length > 0) {
      console.log('All invited auctions:');
      allInvitedAuctions.forEach((auction, index) => {
        console.log(`${index + 1}. ${auction.auction_id} - Status: ${auction.status} - Date: ${auction.auction_date} ${auction.start_time}`);
      });
    }

    // STEP 2: Filter for approved/live status auctions
    const approvedAuctions = allInvitedAuctions?.filter(a => 
      a.status === 'approved' || a.status === 'live'
    ) || [];

    console.log(`Found ${approvedAuctions.length} approved/live auctions`);

    if (approvedAuctions.length === 0) {
      console.log('No approved/live auctions found for this bidder');
      
      // Check if there are pending auctions that might need approval
      const pendingAuctions = allInvitedAuctions?.filter(a => a.status === 'pending') || [];
      let message = 'No approved auctions found';
      
      if (pendingAuctions.length > 0) {
        message = `Found ${pendingAuctions.length} pending auction(s) awaiting approval`;
        console.log('Pending auctions:', pendingAuctions.map(a => a.auction_id));
      }

      return res.status(200).json({
        success: true,
        count: 0,
        auctions: [],
        current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss'),
        debug: {
          bidderId,
          totalInvitedAuctions: allInvitedAuctions?.length || 0,
          approvedAuctions: approvedAuctions.length,
          pendingAuctions: pendingAuctions.length,
          liveAuctionCount: 0
        },
        message
      });
    }

    // STEP 3: Check each approved auction for live status with detailed logging
    const liveAuctions = [];
    
    for (const auction of approvedAuctions) {
      //console.log(`\n--- Checking auction ${auction.auction_id} for live status ---`);
      //console.log(`Status: ${auction.status}`);
      //console.log(`Date/Time: ${auction.auction_date} ${auction.start_time}`);
      //console.log(`Duration: ${auction.duration_minutes} minutes`);
      
      // Create start and end times
      const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
      const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
      
      //console.log(`Start (SL): ${startDateTime.format('YYYY-MM-DD HH:mm:ss')}`);
      //console.log(`End (SL): ${endDateTime.format('YYYY-MM-DD HH:mm:ss')}`);
      //console.log(`Current (SL): ${nowSL.format('YYYY-MM-DD HH:mm:ss')}`);
      
      // Check if within time bounds
      const isAfterStart = nowSL.isSameOrAfter(startDateTime);
      const isBeforeEnd = nowSL.isBefore(endDateTime);
      const isWithinTime = isAfterStart && isBeforeEnd;
      
      //console.log(`After start: ${isAfterStart}`);
      //console.log(`Before end: ${isBeforeEnd}`);
      //console.log(`Within time: ${isWithinTime}`);
      
      const isApproved = auction.status === 'approved' || auction.status === 'live';
      const isLive = isApproved && isWithinTime;
      
      //console.log(`Is approved: ${isApproved}`);
      //console.log(`Final is live: ${isLive}`);
      
      if (isLive) {
        console.log(`✅ Auction ${auction.auction_id} is LIVE`);
        liveAuctions.push(auction);
      } else {
        console.log(`❌ Auction ${auction.auction_id} is NOT live`);
      }
    }

    console.log(`\nFinal result: ${liveAuctions.length} live auctions found`);

    if (liveAuctions.length === 0) {
      // Provide detailed feedback about why no auctions are live
      const futureAuctions = approvedAuctions.filter(a => {
        const startDateTime = moment.tz(`${a.auction_date} ${a.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
        return nowSL.isBefore(startDateTime);
      });

      const pastAuctions = approvedAuctions.filter(a => {
        const startDateTime = moment.tz(`${a.auction_date} ${a.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
        const endDateTime = startDateTime.clone().add(a.duration_minutes, 'minutes');
        return nowSL.isSameOrAfter(endDateTime);
      });

      let message = 'No auctions are currently live. ';
      if (futureAuctions.length > 0) {
        const nextAuction = futureAuctions[0];
        const nextStart = moment.tz(`${nextAuction.auction_date} ${nextAuction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
        message += `Next auction "${nextAuction.title}" starts at ${nextStart.format('YYYY-MM-DD HH:mm:ss')} SL time.`;
      } else if (pastAuctions.length > 0) {
        message += 'All approved auctions have ended.';
      }

      return res.status(200).json({
        success: true,
        count: 0,
        auctions: [],
        current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss'),
        debug: {
          bidderId,
          totalInvitedAuctions: allInvitedAuctions?.length || 0,
          approvedAuctions: approvedAuctions.length,
          futureAuctions: futureAuctions.length,
          pastAuctions: pastAuctions.length,
          liveAuctionCount: 0
        },
        message
      });
    }

    // STEP 4: Prepare response for live auctions
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

    console.log('=== RETURNING LIVE AUCTIONS ===');
    enrichedLiveAuctions.forEach(auction => {
      console.log(`${auction.auction_id}: ${auction.title} (${auction.time_remaining_ms}ms remaining)`);
    });

    res.status(200).json({
      success: true,
      count: enrichedLiveAuctions.length,
      auctions: enrichedLiveAuctions,
      current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss'),
      debug: {
        bidderId,
        totalInvitedAuctions: allInvitedAuctions?.length || 0,
        approvedAuctions: approvedAuctions.length,
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

// FIXED: Updated isAuctionLive function with null safety
const isAuctionLive = (auction) => {
  try {
    const nowSL = getCurrentSLTime();
    
    // FIXED: Add null/undefined checks
    if (!auction || !auction.auction_date || !auction.start_time) {
      console.log(`isAuctionLive: Missing required auction data`);
      console.log(`  - auction_date: ${auction?.auction_date}`);
      console.log(`  - start_time: ${auction?.start_time}`);
      return false;
    }
    
    // Handle different date formats from database
    let auctionDate = auction.auction_date;
    let auctionTime = auction.start_time;
    
    // Handle date objects
    if (auctionDate instanceof Date) {
      auctionDate = moment(auctionDate).format('YYYY-MM-DD');
    }
    
    // Convert to string if not already
    auctionDate = String(auctionDate);
    auctionTime = String(auctionTime);
    
    // Handle time format - remove milliseconds if present
    if (auctionTime.includes('.')) {
      auctionTime = auctionTime.split('.')[0];
    }
    
    // Create datetime string
    const dateTimeString = `${auctionDate} ${auctionTime}`;
    
    console.log(`isAuctionLive debug for ${auction.auction_id || auction.id}:`);
    console.log(`  - Raw auction_date: ${auction.auction_date} (type: ${typeof auction.auction_date})`);
    console.log(`  - Raw start_time: ${auction.start_time} (type: ${typeof auction.start_time})`);
    console.log(`  - Formatted dateTimeString: ${dateTimeString}`);
    
    // Try primary parsing method
    let startDateTime = moment.tz(dateTimeString, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
    
    if (!startDateTime.isValid()) {
      console.log(`  - Primary parsing failed, trying alternative methods...`);
      
      // Alternative method 1: Parse date and time separately
      const datePart = moment.tz(auctionDate, 'YYYY-MM-DD', 'Asia/Colombo');
      const timeParts = auctionTime.split(':');
      
      if (timeParts.length < 2) {
        console.log(`  - Invalid time format: ${auctionTime}`);
        return false;
      }
      
      const hours = parseInt(timeParts[0]) || 0;
      const minutes = parseInt(timeParts[1]) || 0;
      const seconds = parseInt(timeParts[2]) || 0;
      
      startDateTime = datePart.clone().hour(hours).minute(minutes).second(seconds);
      
      if (!startDateTime.isValid()) {
        console.log(`  - Alternative parsing also failed`);
        return false;
      } else {
        console.log(`  - Alternative parsing SUCCESS: ${startDateTime.format()}`);
      }
    }
    
    const endDateTime = startDateTime.clone().add(auction.duration_minutes || 0, 'minutes');
    
    // Check if auction is approved and within time bounds
    const isApproved = auction.status === 'approved' || auction.status === 'live';
    const isWithinTimeRange = nowSL.isBetween(startDateTime, endDateTime, null, '[]');
    
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

// FIXED: Updated getAuctionStatus with null safety
const getAuctionStatus = (auction) => {
  try {
    const nowSL = getCurrentSLTime();
    
    // FIXED: Add null/undefined checks
    if (!auction || !auction.auction_date || !auction.start_time) {
      console.log(`getAuctionStatus: Missing required auction data`);
      console.log(`  - auction_date: ${auction?.auction_date}`);
      console.log(`  - start_time: ${auction?.start_time}`);
      return 'error';
    }
    
    // Handle date/time parsing the same way
    let auctionDate = auction.auction_date;
    let auctionTime = auction.start_time;
    
    if (auctionDate instanceof Date) {
      auctionDate = moment(auctionDate).format('YYYY-MM-DD');
    }
    
    // Convert to string if not already
    auctionDate = String(auctionDate);
    auctionTime = String(auctionTime);
    
    if (auctionTime.includes('.')) {
      auctionTime = auctionTime.split('.')[0];
    }
    
    // Try to parse the datetime
    let startDateTime;
    const dateTimeString = `${auctionDate} ${auctionTime}`;
    startDateTime = moment.tz(dateTimeString, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
    
    if (!startDateTime.isValid()) {
      // Fallback parsing
      const datePart = moment.tz(auctionDate, 'YYYY-MM-DD', 'Asia/Colombo');
      const timeParts = auctionTime.split(':');
      
      if (timeParts.length < 2) {
        console.error(`Invalid time format in getAuctionStatus: ${auctionTime}`);
        return 'error';
      }
      
      const hours = parseInt(timeParts[0]) || 0;
      const minutes = parseInt(timeParts[1]) || 0;
      const seconds = parseInt(timeParts[2]) || 0;
      
      startDateTime = datePart.clone().hour(hours).minute(minutes).second(seconds);
    }
    
    if (!startDateTime.isValid()) {
      console.error(`Cannot parse auction datetime: ${dateTimeString}`);
      return 'error';
    }
    
    const endDateTime = startDateTime.clone().add(auction.duration_minutes || 0, 'minutes');
    
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
  } catch (error) {
    console.error('Error in getAuctionStatus:', error);
    return 'error';
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