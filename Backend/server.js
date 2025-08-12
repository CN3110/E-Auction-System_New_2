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
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./Routes/auth'));
app.use('/api/admin', require('./Routes/admin'));
app.use('/api/auction', require('./Routes/auctionRoutes'));
app.use('/api/bid', require('./Routes/bidRoutes'));

console.log("Admin routes path:", require.resolve('./Routes/admin'));

// Modify your route registration
const adminRouter = require('./Routes/admin');
app.use('/api/admin', adminRouter);
console.log("Registered admin routes:");

// Real-time handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join-auction', (auctionId) => {
    socket.join(`auction-${auctionId}`);
  });
  
  socket.on('place-bid', async (data) => {
    // Handle bid placement
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

// Real-time ranking updates for MySQL
const { query } = require('./Config/database');
const moment = require('moment-timezone');

// Function to update rankings for all live auctions
const updateLiveAuctionRankings = async () => {
  try {
    const nowSL = moment().tz('Asia/Colombo');
    
    // Get all live auctions
    const { data: auctions, error } = await query(
      'SELECT id, auction_date, start_time, duration_minutes FROM auctions'
    );
    
    if (error) {
      console.error('Error fetching auctions for ranking update:', error);
      return;
    }
    
    const liveAuctions = auctions.filter(auction => {
      const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
      const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
      return nowSL.isBetween(startDateTime, endDateTime);
    });
    
    // Update rankings for each live auction
    for (const auction of liveAuctions) {
      await updateAuctionRankings(auction.id);
    }
    
  } catch (error) {
    console.error('Error in updateLiveAuctionRankings:', error);
  }
};

// Function to update rankings for a specific auction
const updateAuctionRankings = async (auctionId) => {
  try {
    // Get all bids for this auction
    const { data: allBids, error } = await query(
      'SELECT id, bidder_id, amount FROM bids WHERE auction_id = ? ORDER BY amount ASC',
      [auctionId]
    );
    
    if (error) {
      console.error(`Error fetching bids for auction ${auctionId}:`, error);
      return;
    }
    
    // Group by bidder and get their lowest bid
    const bidderLowestBids = {};
    allBids.forEach(bid => {
      if (!bidderLowestBids[bid.bidder_id] || bid.amount < bidderLowestBids[bid.bidder_id].amount) {
        bidderLowestBids[bid.bidder_id] = {
          amount: bid.amount,
          bidId: bid.id
        };
      }
    });
    
    // Create sorted array of bidders by their lowest bid (rank 1 = lowest amount)
    const sortedBidders = Object.entries(bidderLowestBids)
      .sort(([, bidA], [, bidB]) => bidA.amount - bidB.amount);
    
    // Update rankings - emit socket events to update clients
    sortedBidders.forEach(([bidderId, bidInfo], index) => {
      const rank = index + 1;
      
      // Emit ranking update to all clients in this auction room
      io.to(`auction-${auctionId}`).emit('ranking-update', {
        auctionId,
        bidderId,
        rank,
        amount: bidInfo.amount,
        totalBidders: sortedBidders.length
      });
    });
    
    console.log(`Updated rankings for auction ${auctionId}: ${sortedBidders.length} bidders`);
    
  } catch (error) {
    console.error(`Error updating rankings for auction ${auctionId}:`, error);
  }
};

// Start the ranking update scheduler (runs every minute)
const startRankingScheduler = () => {
  console.log('🔄 Starting ranking update scheduler (every 1 minute)');
  
  // Run immediately on startup
  updateLiveAuctionRankings();
  
  // Then run every minute
  setInterval(updateLiveAuctionRankings, 60000); // 60 seconds
};

// Start the scheduler after creating the server
startRankingScheduler();

// Export for use in other files
module.exports = {
  updateLiveAuctionRankings,
  updateAuctionRankings
};