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

        res.status(200).json({
            success: true,
            auctions: auctions.map(auction => ({
                AuctionID: auction.AuctionID,
                Title: auction.Title,
                DateTime: auction.DateTime,
                Duration: `${auction.Duration} minutes`,
                Status: auction.Status.charAt(0).toUpperCase() + auction.Status.slice(1), // Capitalize status
                InvitedBidders: auction.InvitedBidders || 'No bidders invited'
            }))
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
};