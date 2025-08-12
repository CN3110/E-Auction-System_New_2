const { supabaseAdmin } = require('../Config/database');
const moment = require('moment-timezone');

// Place a bid 
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
        const { data: auction, error: auctionError } = await supabaseAdmin
            .from('auctions')
            .select('*')
            .eq('id', auction_id)
            .single();

        if (auctionError || !auction) {
            return res.status(404).json({ 
                success: false,
                error: 'Auction not found' 
            });
        }

        // Check if auction is live (Sri Lanka time)
        const nowSL = moment().tz('Asia/Colombo');
        const startDateTime = moment.tz(`${auction.auction_date} ${auction.start_time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
        const endDateTime = startDateTime.clone().add(auction.duration_minutes, 'minutes');

        if (!nowSL.isBetween(startDateTime, endDateTime)) {
            return res.status(400).json({ 
                success: false,
                error: 'Auction is not currently live' 
            });
        }

        // Check if bidder is invited to this auction
        const { data: invitation, error: inviteError } = await supabaseAdmin
            .from('auction_bidders')
            .select('*')
            .eq('auction_id', auction_id)
            .eq('bidder_id', bidder_id)
            .single();

        if (inviteError || !invitation) {
            return res.status(403).json({ 
                success: false,
                error: 'You are not invited to this auction' 
            });
        }

        // Insert the new bid
        const { data: newBid, error: bidError } = await supabaseAdmin
            .from('bids')
            .insert([{
                auction_id: auction_id,
                bidder_id: bidder_id,
                amount: parseFloat(amount),
                bid_time: nowSL.toISOString()
            }])
            .select('*')
            .single();

        if (bidError) {
            console.error('Bid insertion error:', bidError);
            return res.status(500).json({ 
                success: false,
                error: 'Failed to place bid' 
            });
        }

        // Get current rank after placing bid
        const rank = await getBidderCurrentRank(auction_id, bidder_id);

        // Get current lowest bid for the auction
        const { data: lowestBid } = await supabaseAdmin
            .from('bids')
            .select('amount')
            .eq('auction_id', auction_id)
            .order('amount', { ascending: true })
            .limit(1)
            .single();

        res.status(201).json({
            success: true,
            message: 'Bid placed successfully',
            bid: newBid,
            rank: rank,
            currentLowest: lowestBid?.amount || parseFloat(amount)
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
        const { data: allBids, error } = await supabaseAdmin
            .from('bids')
            .select('bidder_id, amount')
            .eq('auction_id', auctionId)
            .order('amount', { ascending: true });

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

        const { data: bid, error } = await supabaseAdmin
            .from('bids')
            .select('*')
            .eq('auction_id', auction_id)
            .eq('bidder_id', bidderId)
            .order('bid_time', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Get latest bid error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch latest bid'
            });
        }

        res.json({
            success: true,
            bid: bid || null
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
        const { data: totalBidders } = await supabaseAdmin
            .from('bids')
            .select('bidder_id')
            .eq('auction_id', auction_id);

        const uniqueBidders = [...new Set(totalBidders?.map(b => b.bidder_id) || [])];

        res.json({
            success: true,
            rank: rank,
            totalBidders: uniqueBidders.length
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

        const { data: bids, error } = await supabaseAdmin
            .from('bids')
            .select(`
                *,
                users(name, company, user_id)
            `)
            .eq('auction_id', auctionId)
            .order('bid_time', { ascending: false });

        if (error) {
            console.error('Get auction bids error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch bids'
            });
        }

        res.json({
            success: true,
            bids
        });

    } catch (error) {
        console.error('Get auction bids error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

// Updated getBidderHistory function for bidController.js

const getBidderHistory = async (req, res) => {
    try {
        const bidderId = req.user.id;
        const { page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Get bidder's auction history - LATEST bid per auction (not lowest)
        const { data: history, error } = await supabaseAdmin
            .from('bids')
            .select(`
                auction_id,
                amount,
                bid_time,
                auctions(
                    id,
                    auction_id,
                    title, 
                    auction_date, 
                    start_time,
                    duration_minutes,
                    status
                )
            `)
            .eq('bidder_id', bidderId)
            .order('bid_time', { ascending: false });

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
                auctionMap[auctionId] = bid;
            }
        });

        // Convert to array and sort by bid time (most recent first)
        let processedHistory = Object.values(auctionMap)
            .sort((a, b) => new Date(b.bid_time) - new Date(a.bid_time));

        // Apply pagination
        const totalAuctions = processedHistory.length;
        const paginatedHistory = processedHistory.slice(offset, offset + parseInt(limit));

        // Calculate win/loss result for each auction based on the bidder's LAST bid
        const historyWithResults = await Promise.all(
            paginatedHistory.map(async (historyItem) => {
                try {
                    const auction = historyItem.auctions;
                    let result = 'Pending';
                    
                    if (!auction) {
                        return { ...historyItem, result: 'Unknown' };
                    }

                    // Check if auction has ended
                    const now = new Date();
                    const auctionStart = new Date(`${auction.auction_date}T${auction.start_time}`);
                    const auctionEnd = new Date(auctionStart.getTime() + auction.duration_minutes * 60000);
                    
                    if (auction.status === 'cancelled') {
                        result = 'Cancelled';
                    } else if (now < auctionEnd && auction.status !== 'completed') {
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
            }
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
        const { data: allBids, error } = await supabaseAdmin
            .from('bids')
            .select('bidder_id, amount, bid_time')
            .eq('auction_id', auctionId)
            .order('bid_time', { ascending: false });

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
    determineLastBidResult
};