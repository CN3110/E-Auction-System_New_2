const { query } = require('../Config/database');
const moment = require('moment-timezone');

// Helper function to get current Sri Lanka time
const getCurrentSLTime = () => {
  return moment().tz('Asia/Colombo');
};

// Helper function to check if auction is live (consistent with auction controller)
const isAuctionLive = (auction) => {
  const nowSL = getCurrentSLTime();
  const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
  const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
  
  return nowSL.isBetween(startDateTime, endDateTime, null, '[]'); // inclusive of start and end
};

// Place a bid - FIXED TIMEZONE
const placeBid = async (req, res) => {
    try {
        const { amount, auction_id } = req.body;
        const bidder_id = req.user.id;

        // Validate input
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Please enter a valid positive bid amount' 
            });
        }

        if (!auction_id) {
            return res.status(400).json({ 
                success: false,
                error: 'Auction ID is required' 
            });
        }

        // Get auction details and validate
        const { data: auctions, error: auctionError } = await query(
            'SELECT * FROM auctions WHERE id = ?',
            [auction_id]
        );

        if (auctionError || !auctions || auctions.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Auction not found' 
            });
        }

        const auction = auctions[0];

        // Check if auction is live using Sri Lanka time
        if (!isAuctionLive(auction)) {
            const nowSL = getCurrentSLTime();
            const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
            const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');
            
            let message = 'Auction is not currently live';
            if (nowSL.isBefore(startDateTime)) {
                message = `Auction hasn't started yet. It will begin at ${startDateTime.format('MMMM DD, YYYY hh:mm A')} (Sri Lanka Time)`;
            } else if (nowSL.isAfter(endDateTime)) {
                message = `Auction has ended. It ended at ${endDateTime.format('MMMM DD, YYYY hh:mm A')} (Sri Lanka Time)`;
            }
            
            return res.status(400).json({ 
                success: false,
                error: message,
                current_time_sl: nowSL.format('YYYY-MM-DD HH:mm:ss'),
                auction_start: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
                auction_end: endDateTime.format('YYYY-MM-DD HH:mm:ss')
            });
        }

        // Check if bidder is invited to this auction
        const { data: invitations, error: inviteError } = await query(
            'SELECT * FROM auction_bidders WHERE auction_id = ? AND bidder_id = ?',
            [auction_id, bidder_id]
        );

        if (inviteError || !invitations || invitations.length === 0) {
            return res.status(403).json({ 
                success: false,
                error: 'You are not invited to this auction' 
            });
        }

        // Insert the new bid with Sri Lanka time
        const bidTime = getCurrentSLTime();
        const { data: bidResult, error: bidError } = await query(
            'INSERT INTO bids (auction_id, bidder_id, amount, bid_time) VALUES (?, ?, ?, ?)',
            [auction_id, bidder_id, parseFloat(amount), bidTime.format('YYYY-MM-DD HH:mm:ss')]
        );

        if (bidError) {
            console.error('Bid insertion error:', bidError);
            return res.status(500).json({ 
                success: false,
                error: 'Failed to place bid' 
            });
        }

        // Get the created bid
        const { data: newBids } = await query(
            'SELECT * FROM bids WHERE auction_id = ? AND bidder_id = ? ORDER BY bid_time DESC LIMIT 1',
            [auction_id, bidder_id]
        );

        const newBid = newBids[0];

        // Get current rank after placing bid
        const rank = await getBidderCurrentRank(auction_id, bidder_id);

        // Get current lowest bid for the auction
        const { data: lowestBids } = await query(
            'SELECT amount FROM bids WHERE auction_id = ? ORDER BY amount ASC LIMIT 1',
            [auction_id]
        );

        res.status(201).json({
            success: true,
            message: 'Bid placed successfully!',
            bid: newBid,
            rank: rank,
            currentLowest: lowestBids?.[0]?.amount || parseFloat(amount),
            bid_time_sl: bidTime.format('YYYY-MM-DD HH:mm:ss')
        });

    } catch (error) {
        console.error('Bid placement error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to process bid'
        });
    }
};

// Helper function to get bidder's current rank
const getBidderCurrentRank = async (auctionId, bidderId) => {
    try {
        // Get all unique bidders' lowest bids for this auction
        const { data: allBids, error } = await query(
            'SELECT bidder_id, amount FROM bids WHERE auction_id = ? ORDER BY amount ASC',
            [auctionId]
        );

        if (error || !allBids) return null;

        // Group by bidder and get their lowest bid
        const bidderLowestBids = {};
        allBids.forEach(bid => {
            if (!bidderLowestBids[bid.bidder_id] || bid.amount < bidderLowestBids[bid.bidder_id]) {
                bidderLowestBids[bid.bidder_id] = bid.amount;
            }
        });

        // Create sorted array of bidders by their lowest bid (rank 1 = lowest amount)
        const sortedBidders = Object.entries(bidderLowestBids)
            .sort(([, amountA], [, amountB]) => amountA - amountB);
        
        // Find the bidder's rank
        const rank = sortedBidders.findIndex(([bidder]) => bidder === bidderId) + 1;
        return rank || null;

    } catch (error) {
        console.error('Error getting bidder rank:', error);
        return null;
    }
};

// Get latest bid for a bidder in a specific auction
const getLatestBid = async (req, res) => {
    try {
        const { auction_id } = req.query;
        const bidderId = req.user.id;

        if (!auction_id) {
            return res.status(400).json({
                success: false,
                error: 'Auction ID is required'
            });
        }

        const { data: bids, error } = await query(
            'SELECT * FROM bids WHERE auction_id = ? AND bidder_id = ? ORDER BY bid_time DESC LIMIT 1',
            [auction_id, bidderId]
        );

        if (error) {
            console.error('Get latest bid error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch latest bid'
            });
        }

        res.json({
            success: true,
            bid: bids && bids.length > 0 ? bids[0] : null,
            current_time_sl: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
        });

    } catch (error) {
        console.error('Get latest bid error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

// Get bidder's rank in a specific auction
const getBidderRank = async (req, res) => {
    try {
        const { auction_id } = req.query;
        const bidderId = req.user.id;

        if (!auction_id) {
            return res.status(400).json({
                success: false,
                error: 'Auction ID is required'
            });
        }

        const rank = await getBidderCurrentRank(auction_id, bidderId);

        // Get total number of bidders who have placed bids
        const { data: totalBidders } = await query(
            'SELECT DISTINCT bidder_id FROM bids WHERE auction_id = ?',
            [auction_id]
        );

        res.json({
            success: true,
            rank: rank,
            totalBidders: totalBidders?.length || 0,
            current_time_sl: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
        });

    } catch (error) {
        console.error('Get bidder rank error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

// Get all bids for an auction (admin only)
const getAuctionBids = async (req, res) => {
    try {
        const { auctionId } = req.params;

        const { data: bids, error } = await query(`
            SELECT b.*, u.name, u.company, u.user_id
            FROM bids b
            JOIN users u ON b.bidder_id = u.id
            WHERE b.auction_id = ?
            ORDER BY b.bid_time DESC
        `, [auctionId]);

        if (error) {
            console.error('Get auction bids error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch bids'
            });
        }

        res.json({
            success: true,
            bids,
            current_time_sl: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
        });

    } catch (error) {
        console.error('Get auction bids error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

// Get bidder's auction history - FIXED TIMEZONE
const getBidderHistory = async (req, res) => {
    try {
        const bidderId = req.user.id;
        const { page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Get bidder's auction history - LATEST bid per auction (not lowest)
        const { data: history, error } = await query(`
            SELECT b.auction_id, b.amount, b.bid_time,
                   a.id, a.auction_id as auction_code, a.title, a.auction_date, 
                   a.start_time, a.duration_minutes, a.status
            FROM bids b
            JOIN auctions a ON b.auction_id = a.id
            WHERE b.bidder_id = ?
            ORDER BY b.bid_time DESC
        `, [bidderId]);

        if (error) {
            console.error('Get bidder history error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch bidding history'
            });
        }

        // Group by auction and get the LATEST bid for each auction (by bid_time)
        const auctionMap = {};
        history.forEach(bid => {
            const auctionId = bid.auction_id;
            if (!auctionMap[auctionId] || new Date(bid.bid_time) > new Date(auctionMap[auctionId].bid_time)) {
                auctionMap[auctionId] = {
                    ...bid,
                    auctions: {
                        id: bid.id,
                        auction_id: bid.auction_code,
                        title: bid.title,
                        auction_date: bid.auction_date,
                        start_time: bid.start_time,
                        duration_minutes: bid.duration_minutes,
                        status: bid.status
                    }
                };
            }
        });

        // Convert to array and sort by bid time (most recent first)
        let processedHistory = Object.values(auctionMap)
            .sort((a, b) => new Date(b.bid_time) - new Date(a.bid_time));

        // Apply pagination
        const totalAuctions = processedHistory.length;
        const paginatedHistory = processedHistory.slice(offset, offset + parseInt(limit));

        // Calculate win/loss result for each auction based on the bidder's LAST bid with proper timezone handling
        const historyWithResults = await Promise.all(
            paginatedHistory.map(async (historyItem) => {
                try {
                    const auction = historyItem.auctions;
                    let result = 'Pending';
                    
                    if (!auction) {
                        return { ...historyItem, result: 'Unknown' };
                    }

                    // Check if auction has ended using Sri Lanka time
                    const nowSL = getCurrentSLTime();
                    const auctionStart = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
                    const auctionEnd = auctionStart.clone().add(auction.duration_minutes, 'minutes');
                    
                    if (auction.status === 'cancelled') {
                        result = 'Cancelled';
                    } else if (nowSL.isBefore(auctionEnd) && auction.status !== 'ended') {
                        result = 'In Progress';
                    } else {
                        // Auction has ended, determine if bidder's LAST bid was the winning bid
                        result = await determineLastBidResult(historyItem.auction_id, bidderId, historyItem.amount);
                    }

                    return {
                        ...historyItem,
                        result: result
                    };
                } catch (error) {
                    console.error('Error calculating result for auction:', historyItem.auction_id, error);
                    return {
                        ...historyItem,
                        result: 'Unknown'
                    };
                }
            })
        );

        // Calculate pagination info
        const totalPages = Math.ceil(totalAuctions / parseInt(limit));

        // Get summary statistics
        const totalBidsCount = history.length;
        const wonAuctions = historyWithResults.filter(h => h.result === 'Won').length;
        const completedAuctions = historyWithResults.filter(h => 
            h.result === 'Won' || h.result === 'Lost'
        ).length;

        res.json({
            success: true,
            history: historyWithResults,
            pagination: {
                currentPage: parseInt(page),
                totalPages: totalPages,
                totalItems: totalAuctions,
                itemsPerPage: parseInt(limit),
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            },
            summary: {
                total_auctions_participated: totalAuctions,
                total_bids_placed: totalBidsCount,
                auctions_won: wonAuctions,
                auctions_completed: completedAuctions
            },
            current_time_sl: getCurrentSLTime().format('YYYY-MM-DD HH:mm:ss')
        });

    } catch (error) {
        console.error('Get bidder history error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

// Helper function to determine if bidder's last bid was the winning bid
const determineLastBidResult = async (auctionId, bidderId, bidderLastBidAmount) => {
    try {
        // Get ALL final bids from all bidders in this auction
        const { data: allBids, error } = await query(
            'SELECT bidder_id, amount, bid_time FROM bids WHERE auction_id = ? ORDER BY bid_time DESC',
            [auctionId]
        );

        if (error || !allBids?.length) {
            return 'No Bids';
        }

        // Get each bidder's LAST (most recent) bid
        const bidderLastBids = {};
        allBids.forEach(bid => {
            if (!bidderLastBids[bid.bidder_id] || 
                new Date(bid.bid_time) > new Date(bidderLastBids[bid.bidder_id].bid_time)) {
                bidderLastBids[bid.bidder_id] = {
                    amount: bid.amount,
                    bid_time: bid.bid_time
                };
            }
        });

        // Find the minimum amount among all bidders' last bids
        const allLastBidAmounts = Object.values(bidderLastBids).map(bid => bid.amount);
        const winningAmount = Math.min(...allLastBidAmounts);

        // Check if this bidder's last bid amount equals the winning amount
        if (bidderLastBidAmount === winningAmount) {
            // Additional check: if multiple bidders have the same minimum amount,
            // the one who placed it first wins (earliest timestamp)
            const biddersWithWinningAmount = Object.entries(bidderLastBids)
                .filter(([, bid]) => bid.amount === winningAmount)
                .sort(([, bidA], [, bidB]) => new Date(bidA.bid_time) - new Date(bidB.bid_time));
            
            // Check if this bidder was the first to place the winning amount
            const firstBidderWithWinningAmount = biddersWithWinningAmount[0][0];
            return firstBidderWithWinningAmount === bidderId ? 'Won' : 'Lost';
        } else {
            return 'Lost';
        }

    } catch (error) {
        console.error('Error determining last bid result:', error);
        return 'Unknown';
    }
};

module.exports = {
    placeBid,
    getLatestBid,
    getBidderRank,
    getAuctionBids,
    getBidderHistory,
    determineLastBidResult,
    getCurrentSLTime,
    isAuctionLive
};