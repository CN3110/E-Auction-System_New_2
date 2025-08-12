const { query, transaction } = require('../Config/database');
const { generateAuctionId } = require('../Utils/generators');
const { sendEmail } = require('../Config/email');
const moment = require('moment-timezone');

const createAuction = async (req, res) => {
  try {
    const { title, auction_date, start_time, duration_minutes, special_notices, selected_bidders } = req.body;
    
    // Validate input
    if (!title || !auction_date || !start_time || !selected_bidders?.length) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Get last auction ID
    const { data: lastAuction, error: lastAuctionError } = await query(
      'SELECT auction_id FROM auctions ORDER BY auction_id DESC LIMIT 1'
    );
    
    if (lastAuctionError) throw lastAuctionError;
    
    const auctionId = generateAuctionId(lastAuction?.[0]?.auction_id);
    
    // Create auction with transaction
    const result = await transaction(async (connection) => {
      // Insert auction
      const [auctionResult] = await connection.execute(
        `INSERT INTO auctions (auction_id, title, auction_date, start_time, duration_minutes, special_notices) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [auctionId, title, auction_date, start_time, duration_minutes, special_notices]
      );

      const auctionDbId = auctionResult.insertId;
      
      // Get the created auction
      const [createdAuction] = await connection.execute(
        'SELECT * FROM auctions WHERE auction_id = ?',
        [auctionId]
      );

      // Add selected bidders
      const bidderInvites = selected_bidders.map(bidderId => [createdAuction[0].id, bidderId]);
      
      if (bidderInvites.length > 0) {
        const placeholders = bidderInvites.map(() => '(?, ?)').join(', ');
        const flatValues = bidderInvites.flat();
        
        await connection.execute(
          `INSERT INTO auction_bidders (auction_id, bidder_id) VALUES ${placeholders}`,
          flatValues
        );
      }

      return { auction: createdAuction[0], auction_id: auctionId };
    });

    if (result.error) throw result.error;
    
    // Send emails to selected bidders
    const { data: bidders } = await query(
      `SELECT email, name FROM users WHERE id IN (${selected_bidders.map(() => '?').join(',')}) AND role = 'bidder' AND is_active = TRUE`,
      selected_bidders
    );
    
    if (bidders) {
      for (const bidder of bidders) {
        const emailHTML = `
          <h2>Auction Invitation - Anunine Holdings Pvt Ltd</h2>
          <p>Dear ${bidder.name},</p>
          <p>You've been invited to participate in a new auction:</p>
          <p><strong>Title:</strong> ${title}</p>
          <p><strong>Date:</strong> ${auction_date}</p>
          <p><strong>Time:</strong> ${start_time}</p>
          <p><strong>Duration:</strong> ${duration_minutes} minutes</p>
          ${special_notices ? `<p><strong>Special Notices:</strong> ${special_notices}</p>` : ''}
          <p>Please login to participate.</p>
          <br>
          <p>Best regards,<br>Anunine Holdings Pvt Ltd</p>
        `;
        
        await sendEmail(bidder.email, `Auction Invitation - ${title}`, emailHTML);
      }
    }
    
    res.json({ success: true, auction: result.data.auction, auction_id: result.data.auction_id });
  } catch (error) {
    console.error('Create auction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get live auction for current bidder
const getLiveAuction = async (req, res) => {
  try {
    const bidderId = req.user.id;
    const nowSL = moment().tz('Asia/Colombo');

    // Get all auctions the bidder is invited to
    const { data: invitedAuctions, error } = await query(`
      SELECT a.* FROM auctions a
      JOIN auction_bidders ab ON a.id = ab.auction_id
      WHERE ab.bidder_id = ?
    `, [bidderId]);

    if (error) {
      throw new Error('Error fetching invited auctions');
    }

    // Filter for currently live auctions
    const liveAuctions = invitedAuctions.filter(auction => {
      const startDateTime = moment
        .tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
      const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');

      return nowSL.isBetween(startDateTime, endDateTime);
    });

    res.status(200).json({
      success: true,
      count: liveAuctions.length,
      auctions: liveAuctions,
    });

  } catch (err) {
    console.error('Error fetching live auctions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch live auctions' });
  }
};

// Get all auctions (with filtering)
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

    sql += ' ORDER BY auction_date DESC';

    const { data: auctions, error } = await query(sql, params);

    if (error) {
      console.error('Get auctions error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch auctions'
      });
    }

    res.json({
      success: true,
      auctions
    });

  } catch (error) {
    console.error('Get all auctions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get specific auction details
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

    res.json({
      success: true,
      auction: auctionData
    });

  } catch (error) {
    console.error('Get auction error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get live rankings for an auction
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
      rankings: rankings || []
    });

  } catch (error) {
    console.error('Get live rankings error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get live auctions for admin
const getAdminLiveAuctions = async (req, res) => {
  try {
    const nowSL = moment().tz('Asia/Colombo');

    const { data: auctions, error } = await query(
      'SELECT * FROM auctions ORDER BY auction_date DESC'
    );

    if (error) {
      console.error('Get admin live auctions error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch auctions'
      });
    }

    // Filter for live auctions
    const liveAuctions = auctions.filter(auction => {
      const startDateTime = moment
        .tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
      const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');

      return nowSL.isBetween(startDateTime, endDateTime);
    });

    res.json({
      success: true,
      auctions: liveAuctions,
      count: liveAuctions.length
    });

  } catch (error) {
    console.error('Get admin live auctions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get live rankings for specific auction (admin)
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
      rankings
    });

  } catch (error) {
    console.error('Get admin auction rankings error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get overall auction results (completed auctions with winners)
const getAuctionResults = async (req, res) => {
  try {
    // Get all auctions
    const { data: auctions, error: auctionsError } = await query(
      'SELECT * FROM auctions ORDER BY auction_date DESC'
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
          // Check if auction has ended
          const nowSL = moment().tz('Asia/Colombo');
          const startDateTime = moment
            .tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
          const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
          
          const hasEnded = nowSL.isAfter(endDateTime) || auction.status === 'ended';

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
      results: filteredResults
    });

  } catch (error) {
    console.error('Get auction results error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

const getAllAuctionsAdmin = async (req, res) => {
  try {
    const { status, date, from_date, to_date, title, page = 1, limit = 20 } = req.query;
    
    // Parse and validate pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20)); // Cap at 100
    const offset = Math.max(0, (pageNum - 1) * limitNum);

    // Build the base query
    let whereConditions = [];
    let queryParams = [];

    // Apply filters
    if (status) {
      if (status === 'live') {
        // Special case for live auctions - we'll handle this in the application logic
        whereConditions.push('(status = ? OR status = ?)');
        queryParams.push('scheduled', 'live');
      } else {
        whereConditions.push('status = ?');
        queryParams.push(status);
      }
    }

    if (date) {
      whereConditions.push('auction_date = ?');
      queryParams.push(date);
    } else if (from_date || to_date) {
      if (from_date && to_date) {
        whereConditions.push('auction_date >= ? AND auction_date <= ?');
        queryParams.push(from_date, to_date);
      } else if (from_date) {
        whereConditions.push('auction_date >= ?');
        queryParams.push(from_date);
      } else if (to_date) {
        whereConditions.push('auction_date <= ?');
        queryParams.push(to_date);
      }
    }

    if (title) {
      whereConditions.push('title LIKE ?');
      queryParams.push(`%${title}%`);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Count query for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM auctions a
      ${whereClause}
    `;

    // Main query with aggregated data
    const mainQuery = `
      SELECT a.*,
        COUNT(DISTINCT ab.bidder_id) as bidder_count,
        COUNT(DISTINCT b.id) as bid_count,
        CASE 
          WHEN COUNT(DISTINCT b.id) > 0 THEN TRUE 
          ELSE FALSE 
        END as has_bids
      FROM auctions a
      LEFT JOIN auction_bidders ab ON a.id = ab.auction_id
      LEFT JOIN bids b ON a.id = b.auction_id
      ${whereClause}
      GROUP BY a.id 
      ORDER BY a.auction_date DESC 
      LIMIT ? OFFSET ?
    `;

    // Execute count query
    const { query: dbQuery } = require('../Config/database');
    const [countResult] = await dbQuery(countQuery, queryParams);
    const totalCount = countResult[0]?.total || 0;

    // Execute main query with pagination parameters
    const mainQueryParams = [...queryParams, limitNum, offset];
    const [auctions] = await dbQuery(mainQuery, mainQueryParams);

    // If no auctions found, return empty result
    if (!auctions || auctions.length === 0) {
      return res.json({
        success: true,
        auctions: [],
        pagination: {
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          total_pages: Math.ceil(totalCount / limitNum)
        }
      });
    }

    // Get bidder details for each auction
    const auctionIds = auctions.map(auction => auction.id);
    const biddersQuery = `
      SELECT 
        ab.auction_id,
        ab.bidder_id,
        u.id,
        u.name,
        u.company,
        u.user_id
      FROM auction_bidders ab
      JOIN users u ON ab.bidder_id = u.id
      WHERE ab.auction_id IN (${auctionIds.map(() => '?').join(',')})
    `;

    const [bidders] = await dbQuery(biddersQuery, auctionIds);

    // Group bidders by auction_id
    const biddersByAuction = bidders.reduce((acc, bidder) => {
      if (!acc[bidder.auction_id]) {
        acc[bidder.auction_id] = [];
      }
      acc[bidder.auction_id].push({
        bidder_id: bidder.bidder_id,
        users: {
          id: bidder.id,
          name: bidder.name,
          company: bidder.company,
          user_id: bidder.user_id
        }
      });
      return acc;
    }, {});

    // Get bid details for each auction
    const bidsQuery = `
      SELECT 
        auction_id,
        amount,
        bid_time,
        bidder_id
      FROM bids
      WHERE auction_id IN (${auctionIds.map(() => '?').join(',')})
      ORDER BY bid_time DESC
    `;

    const [bids] = await dbQuery(bidsQuery, auctionIds);

    // Group bids by auction_id
    const bidsByAuction = bids.reduce((acc, bid) => {
      if (!acc[bid.auction_id]) {
        acc[bid.auction_id] = [];
      }
      acc[bid.auction_id].push(bid);
      return acc;
    }, {});

    // Enhance auctions with related data and calculated status
    const nowSL = moment().tz('Asia/Colombo');
    const enhancedAuctions = auctions.map(auction => {
      const startDateTime = moment.tz(
        `${auction.auction_date} ${auction.start_time}`,
        'YYYY-MM-DD HH:mm:ss',
        'Asia/Colombo'
      );
      const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
      
      let calculatedStatus = auction.status;
      if (auction.status === 'scheduled' && nowSL.isAfter(startDateTime)) {
        calculatedStatus = nowSL.isBefore(endDateTime) ? 'live' : 'completed';
      }

      return {
        ...auction,
        calculated_status: calculatedStatus,
        auction_bidders: biddersByAuction[auction.id] || [],
        bids: bidsByAuction[auction.id] || [],
        bidder_count: parseInt(auction.bidder_count) || 0,
        has_bids: auction.has_bids === 1 || auction.has_bids === true
      };
    });

    res.json({
      success: true,
      auctions: enhancedAuctions,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.ceil(totalCount / limitNum)
      }
    });

  } catch (error) {
    console.error('Get all auctions error:', error);
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
};