const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const { testConnection } = require('./Config/database');

// Test DB connection on startup
testConnection().then(success => {
  if (!success) {
    console.error("❌ Failed to connect to database!");
    process.exit(1);
  }
  console.log("✅ Database connection verified");
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
//origin: "https://procubid.anunine.com/",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes (FIXED - removed duplicate admin route registration)
app.use('/api/auth', require('./Routes/auth'));
app.use('/api/admin', require('./Routes/admin'));
app.use('/api/auction', require('./Routes/auctionRoutes'));
app.use('/api/bid', require('./Routes/bidRoutes'));

// Real-time handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join-auction', (auctionId) => {
    socket.join(`auction-${auctionId}`);
    console.log(`User ${socket.id} joined auction room: auction-${auctionId}`);
  });
  
  socket.on('place-bid', async (data) => {
    // Handle bid placement and emit to all users in the auction room
    io.to(`auction-${data.auctionId}`).emit('bid-update', data);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Test route
app.get('/api/test-route', (req, res) => {
  console.log("Test route was hit!");
  res.json({ message: "Backend is working!" });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Import required modules for real-time auction management
const { query } = require('./Config/database');
const moment = require('moment-timezone');
const { 
  updateAuctionStatuses, 
  isAuctionLive 
} = require('./Controllers/auctionController');

// Define getCurrentSLTime locally to avoid circular dependencies
const getCurrentSLTime = () => {
  return moment().tz('Asia/Colombo');
};

// Function to update rankings for all live auctions with Sri Lanka timezone
const updateLiveAuctionRankings = async () => {
  try {
    const nowSL = getCurrentSLTime();
    
    // Get all auctions from database
    const { data: auctions, error } = await query(
      'SELECT id, auction_date, start_time, duration_minutes, status FROM auctions'
    );
    
    if (error) {
      console.error('Error fetching auctions for ranking update:', error);
      return;
    }
    
    // Filter for live auctions using consistent timezone logic
    const liveAuctions = auctions.filter(auction => {
      return isAuctionLive(auction);
    });
    
    // Update rankings for each live auction
    for (const auction of liveAuctions) {
      await updateAuctionRankings(auction.id);
    }
    
    // Update auction statuses in database
    await updateAuctionStatuses();
    
  } catch (error) {
    console.error('Error in updateLiveAuctionRankings:', error);
  }
};

// Function to update rankings for a specific auction (REAL-TIME SOCKET UPDATES)
const updateAuctionRankings = async (auctionId) => {
  try {
    // Get all bids for this auction with bidder information
    const { data: allBids, error } = await query(`
      SELECT b.id, b.bidder_id, b.amount, b.bid_time,
             u.user_id, u.name, u.company
      FROM bids b
      JOIN users u ON b.bidder_id = u.id
      WHERE b.auction_id = ? 
      ORDER BY b.amount ASC, b.bid_time ASC
    `, [auctionId]);
    
    if (error) {
      console.error(`Error fetching bids for auction ${auctionId}:`, error);
      return;
    }
    
    if (!allBids || allBids.length === 0) {
      // Emit empty rankings for auction with no bids
      io.to(`auction-${auctionId}`).emit('ranking-update', {
        auctionId,
        rankings: [],
        totalBidders: 0,
        timestamp: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
      });
      return;
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
          company: bid.company,
          bidId: bid.id
        };
      }
    });
    
    // Create sorted array of bidders by their lowest bid (rank 1 = lowest amount)
    const sortedBidders = Object.values(bidderLowestBids)
      .sort((a, b) => {
        // First sort by amount (lowest first)
        if (a.amount !== b.amount) {
          return a.amount - b.amount;
        }
        // If amounts are equal, sort by bid time (earliest first)
        return new Date(a.bid_time) - new Date(b.bid_time);
      });
    
    // Prepare rankings data for socket emission
    const rankings = sortedBidders.map((bidder, index) => ({
      rank: index + 1,
      bidder_id: bidder.bidder_id,
      user_id: bidder.user_id,
      name: bidder.name,
      company: bidder.company,
      amount: bidder.amount,
      bid_time: bidder.bid_time,
      is_leader: index === 0
    }));
    
    // Emit comprehensive ranking update to all clients in this auction room
    io.to(`auction-${auctionId}`).emit('ranking-update', {
      auctionId,
      rankings,
      totalBidders: sortedBidders.length,
      lowestBid: rankings.length > 0 ? rankings[0].amount : null,
      leader: rankings.length > 0 ? rankings[0] : null,
      timestamp: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
    });
    
    // Also emit individual rank updates to each bidder
    rankings.forEach(ranking => {
      io.to(`auction-${auctionId}`).emit('individual-rank-update', {
        auctionId,
        bidderId: ranking.bidder_id,
        rank: ranking.rank,
        amount: ranking.amount,
        totalBidders: rankings.length,
        isLeading: ranking.rank === 1,
        timestamp: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
      });
    });
    
    console.log(`📊 Updated rankings for auction ${auctionId}: ${sortedBidders.length} bidders, leader: ${rankings[0]?.name || 'None'} with ${rankings[0]?.amount || 'N/A'}`);
    
  } catch (error) {
    console.error(`Error updating rankings for auction ${auctionId}:`, error);
  }
};

// Function to check and update auction statuses (FIXED - removed 'scheduled' status)
const checkAndUpdateAuctionStatuses = async () => {
  try {
    const { data: auctions, error } = await query(
      'SELECT id, auction_id, auction_date, start_time, duration_minutes, status FROM auctions WHERE status != "ended"'
    );
    
    if (error) {
      console.error('Error fetching auctions for status update:', error);
      return;
    }
    
    let updatedCount = 0;
    
    for (const auction of auctions) {
      const nowSL = getCurrentSLTime();
      const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
      const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
      
      let newStatus = auction.status;
      
      // Only change status for approved auctions based on time
      if (auction.status === 'approved') {
        if (nowSL.isBetween(startDateTime, endDateTime, null, '[]')) {
          newStatus = 'live';
          // Emit auction started event
          io.emit('auction-status-change', {
            auctionId: auction.id,
            auction_id: auction.auction_id,
            status: 'live',
            message: 'Auction is now live!',
            timestamp: nowSL.format('YYYY-MM-DD HH:mm:ss')
          });
        } else if (nowSL.isAfter(endDateTime)) {
          newStatus = 'ended';
          // Emit auction ended event
          io.emit('auction-status-change', {
            auctionId: auction.id,
            auction_id: auction.auction_id,
            status: 'ended',
            message: 'Auction has ended!',
            timestamp: nowSL.format('YYYY-MM-DD HH:mm:ss')
          });
        }
      } else if (auction.status === 'live') {
        // Change live auctions to ended when time is up
        if (nowSL.isAfter(endDateTime)) {
          newStatus = 'ended';
          // Emit auction ended event
          io.emit('auction-status-change', {
            auctionId: auction.id,
            auction_id: auction.auction_id,
            status: 'ended',
            message: 'Auction has ended!',
            timestamp: nowSL.format('YYYY-MM-DD HH:mm:ss')
          });
        }
      }
      
      // Update database if status changed
      if (newStatus !== auction.status) {
        await query(
          'UPDATE auctions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newStatus, auction.id]
        );
        updatedCount++;
        console.log(`🔄 Updated auction ${auction.auction_id} status: ${auction.status} → ${newStatus}`);
      }
    }
    
    if (updatedCount > 0) {
      console.log(`✅ Updated ${updatedCount} auction statuses at ${nowSL.format('YYYY-MM-DD HH:mm:ss')} SL time`);
    }
    
  } catch (error) {
    console.error('Error checking and updating auction statuses:', error);
  }
};

// Enhanced auction management scheduler
const startAuctionScheduler = () => {
  const nowSL = getCurrentSLTime();
  console.log(`🚀 Starting auction management scheduler at ${nowSL.format('YYYY-MM-DD HH:mm:ss')} SL time`);
  
  // Run status check immediately on startup
  checkAndUpdateAuctionStatuses();
  
  // Run ranking update immediately on startup
  updateLiveAuctionRankings();
  
  // Schedule status updates every 30 seconds (more frequent for better UX)
  setInterval(() => {
    checkAndUpdateAuctionStatuses();
  }, 30000); // 30 seconds
  
  // Schedule ranking updates every 10 seconds for live auctions
  setInterval(() => {
    updateLiveAuctionRankings();
  }, 10000); // 10 seconds
  
  console.log('⏰ Scheduler configured:');
  console.log('   • Status updates: Every 30 seconds');
  console.log('   • Ranking updates: Every 10 seconds');
  console.log('   • Timezone: Asia/Colombo (Sri Lanka Time)');
};

// Start the enhanced scheduler after server setup
startAuctionScheduler();

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Export for use in other files
module.exports = {
  updateLiveAuctionRankings,
  updateAuctionRankings,
  checkAndUpdateAuctionStatuses,
  io // Export io for use in controllers if needed
};