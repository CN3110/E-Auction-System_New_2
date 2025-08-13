const { query, transaction } = require('../Config/database');
const { generateAuctionId } = require('../Utils/generators');
const { sendEmail } = require('../Config/email');
const moment = require('moment-timezone');

// Helper function to get current Sri Lanka time
const getCurrentSLTime = () => {
  return moment().tz('Asia/Colombo');
};

// Helper function to check if auction is live
const isAuctionLive = (auction) => {
  const nowSL = getCurrentSLTime();
  const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
  const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
  
  return nowSL.isBetween(startDateTime, endDateTime, null, '[]');
};

// Helper function to get auction status
const getAuctionStatus = (auction) => {
  const nowSL = getCurrentSLTime();
  const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
  const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
  
  if (nowSL.isBefore(startDateTime)) {
    return 'pending'; // Changed to match your database schema
  } else if (nowSL.isBetween(startDateTime, endDateTime, null, '[]')) {
    return 'live';
  } else {
    return 'ended';
  }
};

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

    // Validate auction date/time is in future (Sri Lanka time)
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
      // Insert auction - Updated to match your database schema
      const initialStatus = getAuctionStatus({ 
        auction_date, 
        start_time, 
        duration_minutes 
      });
      
      console.log('Inserting auction with status:', initialStatus);
      
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
          initialStatus,
          category,
          sbu,
          created_by_name // Using created_by_name instead of req.user.id as per your schema
        ]
      );

      console.log('Auction inserted with result:', auctionResult);
      const auctionDbId = auctionResult.insertId;
      
      // Get the created auction using the UUID id
      const [createdAuction] = await connection.execute(
        'SELECT * FROM auctions WHERE auction_id = ?',
        [auctionId]
      );

      if (!createdAuction.length) {
        throw new Error('Failed to retrieve created auction');
      }

      console.log('Retrieved created auction:', createdAuction[0]);

      // Add selected bidders - using the UUID id from the created auction
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
    
    console.log('Transaction completed successfully:', result.data);
    
    // Send emails to selected bidders
    try {
      const { data: bidders, error: biddersError } = await query(
        `SELECT email, name FROM users WHERE id IN (${selected_bidders.map(() => '?').join(',')}) AND role = 'bidder' AND is_active = TRUE`,
        selected_bidders
      );
      
      if (biddersError) {
        console.error('Error fetching bidders for email:', biddersError);
      } else if (bidders && bidders.length > 0) {
        // Format date/time for email in Sri Lanka timezone
        const formattedDateTime = moment.tz(`${auction_date} ${start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo')
          .format('MMMM DD, YYYY at hh:mm A');
        
        const emailPromises = bidders.map(async (bidder) => {
          const emailHTML = `
            <h2>Auction Invitation - Anunine Holdings Pvt Ltd</h2>
            <p>Dear ${bidder.name},</p>
            <p>You've been invited to participate in a new auction:</p>
            <p><strong>Title:</strong> ${title}</p>
            <p><strong>Category:</strong> ${category}</p>
            <p><strong>SBU:</strong> ${sbu}</p>
            <p><strong>Date & Time:</strong> ${formattedDateTime} (Sri Lanka Time)</p>
            <p><strong>Duration:</strong> ${duration_minutes} minutes</p>
            ${special_notices ? `<p><strong>Special Notices:</strong> ${special_notices}</p>` : ''}
            <p>Created by: ${created_by_name}</p>
            <p>Please login to participate.</p>
            <br>
            <p>Best regards,<br>Anunine Holdings Pvt Ltd</p>
          `;
          
          try {
            await sendEmail(bidder.email, `Auction Invitation - ${title}`, emailHTML);
          } catch (emailError) {
            console.error(`Failed to send email to ${bidder.email}:`, emailError);
          }
        });

        await Promise.all(emailPromises);
      }
    } catch (emailError) {
      console.error('Error in email sending process:', emailError);
      // Don't fail the entire operation for email errors
    }
    
    res.json({ 
      success: true, 
      auction: result.data.auction, 
      auction_id: result.data.auction_id,
      message: 'Auction created successfully'
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

// Get live auction for current bidder - FIXED TIMEZONE
const getLiveAuction = async (req, res) => {
  try {
    const bidderId = req.user.id;
    const nowSL = getCurrentSLTime();

    // Get all auctions the bidder is invited to
    const { data: invitedAuctions, error } = await query(`
      SELECT a.* FROM auctions a
      JOIN auction_bidders ab ON a.id = ab.auction_id
      WHERE ab.bidder_id = ?
    `, [bidderId]);

    if (error) {
      throw new Error('Error fetching invited auctions');
    }

    // Filter for currently live auctions with proper timezone handling
    const liveAuctions = invitedAuctions.filter(auction => {
      return isAuctionLive(auction);
    });

    res.status(200).json({
      success: true,
      count: liveAuctions.length,
      auctions: liveAuctions,
      current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss'),
    });

  } catch (err) {
    console.error('Error fetching live auctions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch live auctions' });
  }
};

// Get all auctions (with filtering) - FIXED TIMEZONE
const getAllAuctions = async (req, res) => {
  try {
    const { status, date } = req.query;
    const userRole = req.user?.role;
    const userId = req.user?.id;

    let sql = '';
    let params = [];

    if (userRole === 'admin') {
      // Admin can see all auctions
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
      // Bidders can only see auctions they're invited to
      sql = `
        SELECT a.* FROM auctions a
        JOIN auction_bidders ab ON a.id = ab.auction_id
        WHERE ab.bidder_id = ?
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

// Get live auctions for admin - FIXED TIMEZONE
const getAdminLiveAuctions = async (req, res) => {
  try {
    const nowSL = getCurrentSLTime();

    const { data: auctions, error } = await query(
      'SELECT * FROM auctions ORDER BY auction_date DESC, start_time DESC'
    );

    if (error) {
      console.error('Get admin live auctions error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch auctions'
      });
    }

    // Filter for live auctions with proper timezone handling
    const liveAuctions = auctions.filter(auction => {
      return isAuctionLive(auction);
    });

    // Add calculated status and time info
    const enrichedLiveAuctions = liveAuctions.map(auction => {
      const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
      const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
      const timeRemaining = endDateTime.diff(nowSL, 'milliseconds');
      
      return {
        ...auction,
        calculated_status: 'live',
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

// Function to update auction statuses in database
const updateAuctionStatuses = async () => {
  try {
    const { data: auctions, error } = await query('SELECT id, auction_date, start_time, duration_minutes, status FROM auctions');
    
    if (error) {
      console.error('Error fetching auctions for status update:', error);
      return;
    }

    for (const auction of auctions) {
      const calculatedStatus = getAuctionStatus(auction);
      
      // Only update if status has changed
      if (auction.status !== calculatedStatus) {
        await query(
          'UPDATE auctions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [calculatedStatus, auction.id]
        );
        console.log(`Updated auction ${auction.id} status from ${auction.status} to ${calculatedStatus}`);
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

// Other existing functions remain the same...
const getAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;

    const { data: auction, error } = await query(`
      SELECT a.*,
        GROUP_CONCAT(
          JSON_OBJECT(
            'bidder_id', ab.bidder_id,
            'name', u.name,
            'company', u.company
          )
        ) as invited_bidders
      FROM auctions a
      LEFT JOIN auction_bidders ab ON a.id = ab.auction_id
      LEFT JOIN users u ON ab.bidder_id = u.id
      WHERE a.id = ?
      GROUP BY a.id
    `, [auctionId]);

    if (error || !auction || auction.length === 0) {
      console.error('Get auction error:', error);
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    // Parse the invited_bidders JSON
    const auctionData = auction[0];
    if (auctionData.invited_bidders) {
      auctionData.auction_bidders = JSON.parse(`[${auctionData.invited_bidders}]`);
      delete auctionData.invited_bidders;
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

const getAllAuctionsAdmin = async (req, res) => {
    try {
        // Get all auctions with invited bidders' names
        const { data: auctions, error } = await query(`
            SELECT 
                a.auction_id AS AuctionID,
                a.title AS Title,
                CONCAT(a.auction_date, ' ', a.start_time) AS DateTime,
                a.duration_minutes AS Duration,
                a.status AS Status,
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
            duration_minutes: auction.Duration
          });
          
          return {
            AuctionID: auction.AuctionID,
            Title: auction.Title,
            DateTime: auction.DateTime,
            Duration: `${auction.Duration} minutes`,
            Status: calculatedStatus.charAt(0).toUpperCase() + calculatedStatus.slice(1),
            InvitedBidders: auction.InvitedBidders || 'No bidders invited',
            calculated_status: calculatedStatus
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

module.exports = {
  createAuction,
  getLiveAuction,
  getAllAuctions,
  getAuction,
  getLiveRankings,
  getAdminLiveAuctions,
  getAdminAuctionRankings,
  getAuctionResults,
  getAllAuctionsAdmin,
  updateAuctionStatuses, // Export for use in scheduler
  getCurrentSLTime,
  isAuctionLive,
  getAuctionStatus
};