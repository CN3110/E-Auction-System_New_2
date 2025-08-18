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
  const [currentTimeSL, setCurrentTimeSL] = useState('');

  // Helper functions
  const showAlert = useCallback((message, type) => {
    setAlert({ show: true, message, type });
    const timer = setTimeout(() => setAlert({ show: false, message: '', type: '' }), 5000);
    return () => clearTimeout(timer);
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR'
    }).format(amount);
  };

  // IMPROVED: Format date/time to Sri Lanka time (Asia/Colombo)
  const formatToSLTime = (utcDateString) => {
    try {
      const date = new Date(utcDateString);
      if (isNaN(date.getTime())) {
        console.error('Invalid date string:', utcDateString);
        return 'Invalid date';
      }
      
      return date.toLocaleString('en-US', {
        timeZone: 'Asia/Colombo',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  // IMPROVED: Format just the time portion in SL time
  const formatToSLTimeOnly = (utcDateString) => {
    try {
      const date = new Date(utcDateString);
      if (isNaN(date.getTime())) {
        console.error('Invalid date string:', utcDateString);
        return 'Invalid time';
      }
      
      return date.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Colombo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Error formatting time:', error);
      return 'Invalid time';
    }
  };

  // NEW: Get current Sri Lanka time
  const getCurrentSLTime = () => {
    try {
      const now = new Date();
      return now.toLocaleString('en-US', {
        timeZone: 'Asia/Colombo',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Error getting current SL time:', error);
      return 'Invalid time';
    }
  };

  // IMPROVED: Calculate auction end time with proper date handling
  const calculateAuctionEnd = (auctionItem) => {
    try {
      if (auctionItem.auction_end) {
        return new Date(auctionItem.auction_end);
      }
      
      // Handle the auction_date properly
      const startDate = new Date(auctionItem.auction_date);
      if (isNaN(startDate.getTime())) {
        console.error('Invalid auction start date:', auctionItem.auction_date);
        return new Date(); // Return current time as fallback
      }
      
      const endTime = new Date(startDate.getTime() + auctionItem.duration_minutes * 60000);
      return endTime;
    } catch (error) {
      console.error('Error calculating auction end time:', error);
      return new Date();
    }
  };

  // IMPROVED: Auction status check with better error handling
  const isAuctionLive = useCallback((auctionItem) => {
    if (!auctionItem) {
      console.log('No auction item provided');
      return false;
    }
    
    try {
      // Get current time
      const now = new Date();
      
      // Calculate end time
      const auctionEnd = calculateAuctionEnd(auctionItem);
      const auctionStart = new Date(auctionItem.auction_date);
      
      console.log('Frontend auction live check:', {
        auction_id: auctionItem.auction_id,
        now: now.toISOString(),
        now_sl: getCurrentSLTime(),
        auctionStart: auctionStart.toISOString(),
        auctionEnd: auctionEnd.toISOString(),
        is_within_time: now >= auctionStart && now <= auctionEnd,
        status: auctionItem.status,
        calculated_status: auctionItem.calculated_status,
        is_live_flag: auctionItem.is_live
      });
      
      // Check if auction is live based on backend's calculated_status and time range
      const isLiveByStatus = auctionItem.calculated_status === 'live' || auctionItem.is_live;
      const isWithinTime = now >= auctionStart && now <= auctionEnd;
      
      return isLiveByStatus && isWithinTime;
    } catch (error) {
      console.error('Error checking auction status:', error);
      return false;
    }
  }, []);

  const fetchLiveAuction = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      console.log('Fetching live auction with token:', token ? 'Token exists' : 'No token');
      
      if (!token) {
        throw new Error('Please login to access auctions');
      }

      const response = await fetch('http://localhost:5000/api/auction/live/bidder', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Response status:', response.status);
      
      if (response.status === 401) {
        localStorage.removeItem('token');
        throw new Error('Session expired. Please login again.');
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Response error:', errorText);
        throw new Error(`Failed to fetch live auction: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('API Response data:', data);
      
      return Array.isArray(data.auctions) ? data.auctions : [];
    } catch (error) {
      console.error('Error fetching live auction:', error);
      throw error;
    }
  }, []);

  const fetchAuctionData = useCallback(async () => {
    try {
      console.log('Fetching auction data...');
      setHasError(false);
      
      const auctions = await fetchLiveAuction();
      console.log('Received auctions:', auctions);
      
      if (!auctions || auctions.length === 0) {
        console.log('No auctions received from API');
        setAuction(null);
        setBidderInfo({ rank: null, latestBid: null });
        return;
      }
      
      let liveAuction = null;
      for (const auc of auctions) {
        if (auc.calculated_status === 'live' || auc.is_live) {
          liveAuction = auc;
          break;
        }
      }
      
      if (!liveAuction) {
        console.log('No live auctions found');
        setAuction(null);
        setBidderInfo({ rank: null, latestBid: null });
        return;
      }

      setAuction(liveAuction);
      
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
      
      if (error.message.includes('Session expired') || 
          error.message.includes('Please login')) {
        showAlert(error.message, 'danger');
        // Consider redirecting to login here
      } else {
        showAlert(`Error fetching auction data: ${error.message}`, 'danger');
      }
    } finally {
      setInitialLoading(false);
    }
  }, [showAlert]);

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
          auction_id: auctionId
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

  // IMPROVED: Updated timer function with proper SL time handling
  const updateTimer = useCallback(() => {
    if (!auction) return;

    try {
      const now = new Date();
      const auctionEnd = calculateAuctionEnd(auction);
      const timeRemaining = auctionEnd.getTime() - now.getTime();
      
      // Update current SL time
      setCurrentTimeSL(getCurrentSLTime());
      
      console.log('Timer calculation:', {
        now: now.toISOString(),
        now_sl: getCurrentSLTime(),
        auctionStart: auction.auction_date,
        auctionEnd: auctionEnd.toISOString(),
        auctionEnd_sl: formatToSLTime(auctionEnd.toISOString()),
        timeRemaining: timeRemaining,
        timeRemainingMinutes: Math.floor(timeRemaining / 60000)
      });
      
      if (timeRemaining <= 0) {
        setTimeLeft('Auction Ended');
        console.log('Auction ended, refreshing data...');
        fetchAuctionData(); // Refresh data when auction ends
      } else {
        const hours = Math.floor(timeRemaining / 3600000);
        const minutes = Math.floor((timeRemaining % 3600000) / 60000);
        const seconds = Math.floor((timeRemaining % 60000) / 1000);
        
        if (hours > 0) {
          setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        } else {
          setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }
      }
    } catch (error) {
      console.error('Error updating timer:', error);
      setTimeLeft('Error');
    }
  }, [auction, fetchAuctionData]);

  // Effects
  useEffect(() => {
    console.log('Initial data fetch on component mount');
    fetchAuctionData();
    
    // Update current time immediately
    setCurrentTimeSL(getCurrentSLTime());
    
    const interval = setInterval(() => {
      console.log('Periodic data refresh...');
      fetchAuctionData();
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, [fetchAuctionData]);

  useEffect(() => {
    if (auction) {
      updateTimer();
      const timer = setInterval(updateTimer, 1000);
      return () => clearInterval(timer);
    }
  }, [auction, updateTimer]);

  // Update current time every second
  useEffect(() => {
    const timeTimer = setInterval(() => {
      setCurrentTimeSL(getCurrentSLTime());
    }, 1000);
    
    return () => clearInterval(timeTimer);
  }, []);

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
          message="Failed to load auction data. Please refresh the page or try again later." 
          type="danger" 
        />
        <button 
          className="btn btn-primary mt-3" 
          onClick={() => {
            setHasError(false);
            setInitialLoading(true);
            fetchAuctionData();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="live-auction">
        <h2>Live Auction</h2>
        <div className="current-time-display text-center mb-3">
          <small className="text-muted">Current Time (Sri Lanka): </small>
          <strong>{currentTimeSL}</strong>
        </div>
        <Alert 
          message="Currently there are no live auctions available to you. Please check back later or contact the administrator if you believe you should have access to a live auction."
          type="info"
        />
        <button 
          className="btn btn-outline-primary mt-3" 
          onClick={() => fetchAuctionData()}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    );
  }

  // IMPROVED: Calculate auction end time for display with proper error handling
  const auctionEndTime = calculateAuctionEnd(auction);
  const auctionStatus = auction.calculated_status || 
                       (isAuctionLive(auction) ? 'live' : 'ended');

  return (
    <div className="live-auction">
      <h2>Live Auction</h2>
      
      {/* NEW: Current Sri Lanka Time Display */}
      <div className="current-time-display text-center mb-3">
        <small className="text-muted">Current Time (Sri Lanka): </small>
        <strong className="text-primary">{currentTimeSL}</strong>
      </div>
      
      <div className="timer-container text-center mb-4">
        <div className={`timer display-4 fw-bold ${
          auctionStatus === 'live' ? 'text-danger' : 'text-secondary'
        }`}>
          {timeLeft}
        </div>
        <small className="text-muted">
          {auctionStatus === 'live' ? 'Time Remaining' : 'Auction Status'}
        </small>
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
                {bidderInfo.totalBidders > 0 && (
                  <span className="text-muted ms-2">(of {bidderInfo.totalBidders})</span>
                )}
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
                  disabled={loading || auctionStatus !== 'live'}
                />
              </div>
              <button 
                className="btn btn-primary w-100" 
                onClick={handlePlaceBid}
                disabled={loading || !bidAmount || auctionStatus !== 'live'}
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
            <p><strong>Category:</strong> {auction.category}</p>
            <p><strong>SBU:</strong> {auction.sbu}</p>
            
            {/* IMPROVED: Updated date/time display with better formatting */}
            <div className="time-details border-top pt-3 mt-3">
              <h6 className="text-muted">Time Details (Sri Lanka Time)</h6>
              <p className="mb-2">
                <strong>Start Date/Time:</strong> 
                <br />
                <span className="text-success">{formatToSLTime(auction.auction_date)}</span>
              </p>
              
              <p className="mb-2">
                <strong>Duration:</strong> {auction.duration_minutes} minutes
              </p>
            </div>
            
            <div className="status-info border-top pt-3 mt-3">
              <p className="mb-2">
                <strong>Status:</strong> 
                <span className={`badge ms-2 ${
                  auctionStatus === 'live' ? 'bg-success' : 
                  auctionStatus === 'upcoming' ? 'bg-info' : 'bg-secondary'
                }`}>
                  {auctionStatus.toUpperCase()}
                </span>
              </p>
              
              
            </div>
            
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