const { supabaseAdmin } = require('../Config/database');
const { supabaseClient } = require('../Config/database');
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

    // Get last auction ID - FIXED: Use supabaseAdmin
    const { data: lastAuction, error: lastAuctionError } = await supabaseAdmin
      .from('auctions')
      .select('auction_id')
      .order('auction_id', { ascending: false })
      .limit(1);
    
    if (lastAuctionError) throw lastAuctionError;
    
    const auctionId = generateAuctionId(lastAuction?.[0]?.auction_id);
    
    // Create auction - FIXED: Use supabaseAdmin
    const { data: auction, error: auctionError } = await supabaseAdmin
      .from('auctions')
      .insert([{
        auction_id: auctionId,
        title,
        auction_date,
        start_time,
        duration_minutes,
        special_notices
      }])
      .select('id, auction_id')
      .single();

    if (auctionError) throw auctionError;
    
    // Add selected bidders
    const bidderInvites = selected_bidders.map(bidderId => ({
      auction_id: auction.id,
      bidder_id: bidderId
    }));
    
    const { error: biddersError } = await supabaseAdmin
      .from('auction_bidders')
      .insert(bidderInvites);
    
    if (biddersError) throw biddersError;
    
    // Send emails to selected bidders
    const { data: bidders } = await supabaseAdmin
      .from('users')
      .select('email, name')
      .in('id', selected_bidders)
      .eq('role', 'bidder')
      .eq('is_active', true);
    
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
    
    res.json({ success: true, auction, auction_id: auctionId });
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

    // Step 1: Get all auctions the bidder is invited to
    const { data: invitedAuctions, error } = await supabaseClient
      .from('auction_bidders')
      .select('auction_id:auction_id(*)') // get full auction info
      .eq('bidder_id', bidderId);

    if (error) {
      throw new Error('Error fetching invited auctions');
    }

    // Step 2: Filter the invited auctions to only return those that are "currently live"
    const liveAuctions = invitedAuctions
      .map(entry => entry.auction_id)
      .filter(auction => {
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

    let query;

    if (userRole === 'admin') {
      // Admin can see all auctions
      query = supabaseAdmin.from('auctions').select('*');
    } else {
      // Bidders can only see auctions they're invited to
      query = supabaseAdmin
        .from('auctions')
        .select(`
          *,
          auction_bidders!inner(bidder_id)
        `)
        .eq('auction_bidders.bidder_id', userId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (date) {
      query = query.eq('auction_date', date);
    }

    query = query.order('auction_date', { ascending: false });

    const { data: auctions, error } = await query;

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

    const { data: auction, error } = await supabaseAdmin
      .from('auctions')
      .select(`
        *,
        auction_bidders(
          bidder_id,
          users(name, company)
        )
      `)
      .eq('id', auctionId)
      .single();

    if (error) {
      console.error('Get auction error:', error);
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    res.json({
      success: true,
      auction
    });

  } catch (error) {
    console.error('Get auction error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get live rankings for an auction - FIXED: Use the database function
const getLiveRankings = async (req, res) => {
  try {
    const { auctionId } = req.params;

    // Use the database function we created
    const { data: rankings, error } = await supabaseAdmin
      .rpc('get_auction_leaderboard', { p_auction_id: auctionId });

    if (error) {
      console.error('Get rankings error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch rankings'
      });
    }

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

// Helper function to end auction
const endAuction = async (auctionId) => {
  try {
    // Use the database function we created
    const { data: result, error } = await supabaseAdmin
      .rpc('end_auction', { p_auction_id: auctionId });

    if (error) {
      console.error('End auction error:', error);
    }

    return result;
  } catch (error) {
    console.error('End auction error:', error);
  }
};

// Get live auctions for admin
const getAdminLiveAuctions = async (req, res) => {
  try {
    const nowSL = moment().tz('Asia/Colombo');

    // Get all auctions
    const { data: auctions, error } = await supabaseAdmin
      .from('auctions')
      .select('*')
      .order('auction_date', { ascending: false });

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
    const { data: allBids, error } = await supabaseAdmin
      .from('bids')
      .select(`
        bidder_id,
        amount,
        bid_time,
        users(
          user_id,
          name,
          company
        )
      `)
      .eq('auction_id', auctionId)
      .order('bid_time', { ascending: false });

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
          user_id: bid.users.user_id,
          name: bid.users.name,
          company: bid.users.company
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
    // Get all completed or ended auctions
    const { data: auctions, error: auctionsError } = await supabaseAdmin
      .from('auctions')
      .select('*')
      .order('auction_date', { ascending: false });

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
          
          const hasEnded = nowSL.isAfter(endDateTime) || auction.status === 'completed';

          if (!hasEnded && auction.status !== 'cancelled') {
            return null; // Skip ongoing auctions
          }

          // Get winner information for ended auctions
          let winner = null;
          let winningPrice = null;

          if (auction.status !== 'cancelled') {
            // Get all bids for this auction
            const { data: auctionBids, error: bidsError } = await supabaseAdmin
              .from('bids')
              .select(`
                bidder_id,
                amount,
                bid_time,
                users(
                  user_id,
                  name,
                  company
                )
              `)
              .eq('auction_id', auction.id);

            if (!bidsError && auctionBids && auctionBids.length > 0) {
              // Group by bidder and get their lowest bid
              const bidderLowestBids = {};
              auctionBids.forEach(bid => {
                const bidderId = bid.bidder_id;
                if (!bidderLowestBids[bidderId] || bid.amount < bidderLowestBids[bidderId].amount) {
                  bidderLowestBids[bidderId] = {
                    amount: bid.amount,
                    bid_time: bid.bid_time,
                    user_id: bid.users.user_id,
                    name: bid.users.name,
                    company: bid.users.company
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
    const nowSL = moment().tz('Asia/Colombo');

    // Base query for admin
    let query = supabaseAdmin
      .from('auctions')
      .select(`
        *,
        auction_bidders(
          bidder_id,
          users(
            id,
            name,
            company,
            user_id
          )
        ),
        bids!left(
          amount,
          bid_time,
          bidder_id
        )
      `, { count: 'exact' });

    // Apply filters
    if (status) {
      if (status === 'live') {
        // Special case for live auctions - calculate based on time
        query = query.or('status.eq.scheduled,status.eq.live');
      } else {
        query = query.eq('status', status);
      }
    }

    if (date) {
      query = query.eq('auction_date', date);
    } else if (from_date || to_date) {
      if (from_date && to_date) {
        query = query.gte('auction_date', from_date).lte('auction_date', to_date);
      } else if (from_date) {
        query = query.gte('auction_date', from_date);
      } else if (to_date) {
        query = query.lte('auction_date', to_date);
      }
    }

    if (title) {
      query = query.ilike('title', `%${title}%`);
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    query = query.range(offset, offset + limitNum - 1);

    // Order by date (newest first)
    query = query.order('auction_date', { ascending: false });

    const { data: auctions, error, count } = await query;

    if (error) {
      console.error('Get auctions error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch auctions'
      });
    }

    // Enhance the data with calculated status and bidder count
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
        bidder_count: auction.auction_bidders?.length || 0,
        has_bids: auction.bids?.length > 0
      };
    });

    res.json({
      success: true,
      auctions: enhancedAuctions,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.ceil(count / limitNum)
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


// Export the new functions
module.exports = {
  createAuction,
  getLiveAuction,
  getAllAuctions,
  getAuction,
  getLiveRankings,
  getAdminLiveAuctions,      // New
  getAdminAuctionRankings,   // New
  getAuctionResults,
  getAllAuctionsAdmin,         
};