import React, { useState, useEffect, useCallback } from 'react';
import Card from '../Common/Card';
import Alert from '../Common/Alert';

const LiveAuction = () => {
  // State management
  const [bidAmount, setBidAmount] = useState('');
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [auction, setAuction] = useState(null);
  const [bidderInfo, setBidderInfo] = useState({
    rank: null,
    latestBid: null
  });
  const [timeLeft, setTimeLeft] = useState('00:00');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Helper functions
  const showAlert = useCallback((message, type) => {
    setAlert({ show: true, message, type });
    const timer = setTimeout(() => setAlert({ show: false, message: '', type: '' }), 5000);
    return () => clearTimeout(timer);
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'LKR'
    }).format(amount);
  };

  const formatDateTime = (date, time) => {
    try {
      const dateTime = new Date(`${date}T${time}`);
      return dateTime.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  // Auction status check
  const isAuctionLive = useCallback((auctionItem) => {
    if (!auctionItem) return false;
    
    try {
      const now = new Date();
      const auctionStart = new Date(`${auctionItem.auction_date}T${auctionItem.start_time}`);
      const auctionEnd = new Date(auctionStart.getTime() + auctionItem.duration_minutes * 60000);
      return now >= auctionStart && now <= auctionEnd;
    } catch (error) {
      console.error('Error checking auction status:', error);
      return false;
    }
  }, []);

  // API functions
  const fetchLiveAuction = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/auction/bidder/live', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch live auction');
      
      const data = await response.json();
      return Array.isArray(data.auctions) ? data.auctions : [];
    } catch (error) {
      console.error('Error fetching live auction:', error);
      throw error;
    }
  }, []);

  const placeBid = useCallback(async (auctionId, amount) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`http://localhost:5000/api/bid/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        amount: parseFloat(amount),
        auction_id: auctionId  // Add auction_id to the request body
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to place bid');
    }

    return await response.json();
  } catch (error) {
    console.error('Error placing bid:', error);
    throw error;
  }
}, []);

  // Updated fetchBidderRank function to use correct API
const fetchBidderRank = useCallback(async (auctionId) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`http://localhost:5000/api/bid/rank?auction_id=${auctionId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) throw new Error('Failed to fetch bidder rank');

    const data = await response.json();
    return {
      rank: data.rank,
      totalBidders: data.totalBidders
    };
  } catch (error) {
    console.error('Error fetching bidder rank:', error);
    return { rank: null, totalBidders: 0 };
  }
}, []);

// Updated fetchLatestBid function
const fetchLatestBid = useCallback(async (auctionId) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`http://localhost:5000/api/bid/latest?auction_id=${auctionId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) throw new Error('Failed to fetch latest bid');

    const data = await response.json();
    return data.bid;
  } catch (error) {
    console.error('Error fetching latest bid:', error);
    return null;
  }
}, []);


  // Updated fetchAuctionData function
const fetchAuctionData = useCallback(async () => {
  try {
    setHasError(false);
    const auctions = await fetchLiveAuction();
    const liveAuction = auctions.find(auction => isAuctionLive(auction));
    
    if (!liveAuction) {
      setAuction(null);
      setBidderInfo({ rank: null, latestBid: null });
      return;
    }

    setAuction(liveAuction);
    
    // Fetch both rank and latest bid
    const [rankData, latestBid] = await Promise.all([
      fetchBidderRank(liveAuction.id),
      fetchLatestBid(liveAuction.id)
    ]);
    
    setBidderInfo({
      rank: rankData?.rank || null,
      latestBid: latestBid?.amount || null,
      totalBidders: rankData?.totalBidders || 0
    });
  } catch (error) {
    console.error('Error fetching auction data:', error);
    setHasError(true);
    showAlert('Error fetching auction data. Please try again.', 'danger');
  } finally {
    setInitialLoading(false);
  }
}, [fetchLiveAuction, fetchBidderRank, fetchLatestBid, isAuctionLive, showAlert]); 


  const updateTimer = useCallback(() => {
    if (!auction) return;

    try {
      const now = new Date();
      const auctionStart = new Date(`${auction.auction_date}T${auction.start_time}`);
      const auctionEnd = new Date(auctionStart.getTime() + auction.duration_minutes * 60000);
      const timeRemaining = auctionEnd - now;
      
      if (timeRemaining <= 0) {
        setTimeLeft('00:00');
        fetchAuctionData(); // Refresh data when auction ends
      } else {
        const minutes = Math.floor(timeRemaining / 60000);
        const seconds = Math.floor((timeRemaining % 60000) / 1000);
        setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      }
    } catch (error) {
      console.error('Error updating timer:', error);
    }
  }, [auction, fetchAuctionData]);

  // Effects
  useEffect(() => {
    fetchAuctionData();
    const interval = setInterval(fetchAuctionData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchAuctionData]);

  useEffect(() => {
    if (auction) {
      updateTimer();
      const timer = setInterval(updateTimer, 1000);
      return () => clearInterval(timer);
    }
  }, [auction, updateTimer]);

  // Event handlers
  const handlePlaceBid = async () => {
    if (!bidAmount || isNaN(bidAmount)) {
      showAlert('Please enter a valid number for bid amount', 'danger');
      return;
    }

    if (parseFloat(bidAmount) <= 0) {
      showAlert('Bid amount must be greater than 0', 'danger');
      return;
    }

    if (!auction || !isAuctionLive(auction)) {
      showAlert('Auction is not currently live', 'danger');
      return;
    }

    setLoading(true);
    try {
      const result = await placeBid(auction.id, bidAmount);
      showAlert('Bid placed successfully!', 'success');
      setBidAmount('');
      
      // Update local state with new bid info
      setBidderInfo(prev => ({
        ...prev,
        latestBid: parseFloat(bidAmount),
        rank: result.rank || prev.rank
      }));
      
      // Optionally refresh all data
      await fetchAuctionData();
    } catch (error) {
      showAlert(error.message || 'Failed to place bid', 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Render states
  if (initialLoading) {
    return (
      <div className="live-auction text-center p-4">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-2">Loading auction data...</p>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="live-auction">
        <Alert 
          message="Failed to load auction data. Please try again later." 
          type="danger" 
        />
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="live-auction">
        <h2>Live Auction</h2>
        <Alert 
          message="Currently there are no live auctions. Please check back later."
          type="info"
        />
      </div>
    );
  }

  return (
    <div className="live-auction">
      <h2>Live Auction</h2>
      
      <div className="timer-container text-center mb-4">
        <div className="timer display-4 text-primary fw-bold">{timeLeft}</div>
        <small className="text-muted">Time Remaining</small>
      </div>
      
      <div className="row">
        <div className="col-md-6">
          <Card title="Place Your Bid">
            <div className="user-info mb-3">
              <p className="mb-2">
                <strong>Your Current Rank:</strong> 
                <span className={`badge ms-2 ${bidderInfo.rank === 1 ? 'bg-success' : bidderInfo.rank <= 3 ? 'bg-warning' : 'bg-secondary'}`}>
                  {bidderInfo.rank ? `#${bidderInfo.rank}` : 'No rank yet'}
                </span>
              </p>
              <p className="mb-2">
                <strong>Your Latest Bid:</strong> 
                <span className="fw-bold text-success ms-2">
                  {bidderInfo.latestBid ? formatCurrency(bidderInfo.latestBid) : 'No bids yet'}
                </span>
              </p>
            </div>
            
            <div className="bid-input">
              <div className="input-group mb-3">
                <span className="input-group-text">LKR</span>
                <input 
                  type="number" 
                  className="form-control"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="Enter bid amount" 
                  min="0"
                  step="0.01"
                  disabled={loading || !isAuctionLive(auction)}
                />
              </div>
              <button 
                className="btn btn-primary w-100" 
                onClick={handlePlaceBid}
                disabled={loading || !bidAmount || !isAuctionLive(auction)}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    Placing Bid...
                  </>
                ) : (
                  'Place Bid'
                )}
              </button>
            </div>
            
            {alert.show && (
              <Alert 
                message={alert.message} 
                type={alert.type}
                onClose={() => setAlert({ show: false, message: '', type: '' })}
              />
            )}
          </Card>
        </div>
        
        <div className="col-md-6">
          <Card title="Auction Details">
            <p><strong>Title:</strong> {auction.title}</p>
            <p><strong>Auction ID:</strong> {auction.auction_id}</p>
            <p><strong>Start Time:</strong> {formatDateTime(auction.auction_date, auction.start_time)}</p>
            <p><strong>Duration:</strong> {auction.duration_minutes} minutes</p>
            <p>
              <strong>Status:</strong> 
              <span className={`badge ms-2 ${isAuctionLive(auction) ? 'bg-success' : 'bg-secondary'}`}>
                {isAuctionLive(auction) ? 'LIVE' : 'ENDED'}
              </span>
            </p>
            
            {auction.special_notices && (
              <div className="mt-3">
                <strong>Special Notices:</strong>
                <div className="alert alert-info mt-2 small">
                  {auction.special_notices}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LiveAuction;