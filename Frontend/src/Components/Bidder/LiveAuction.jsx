import React, { useState, useEffect, useCallback } from 'react';
import moment from 'moment-timezone';
import Card from '../Common/Card';
import Alert from '../Common/Alert';

const LiveAuction = () => {
  // State management
  const [bidAmount, setBidAmount] = useState('');
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [auction, setAuction] = useState(null);
  const [bidderInfo, setBidderInfo] = useState({
    rank: null,
    latestBid: null,
    totalBidders: 0
  });
  const [timeLeft, setTimeLeft] = useState('00:00:00');
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

  // Get current SL time
  const getCurrentSLTime = () => {
    return moment().tz('Asia/Colombo').format('DD MMM YYYY, h:mm:ss A');
  };

  // Parse SL datetime from backend response - FIXED VERSION
  const parseSLDateTime = (start_datetime_sl) => {
    try {
      if (!start_datetime_sl || start_datetime_sl === 'Invalid date') {
        console.warn('Invalid start_datetime_sl:', start_datetime_sl);
        return null;
      }
      
      // The backend now provides properly formatted SL datetime string like "2025-08-19 09:01:00"
      const parsed = moment.tz(start_datetime_sl, 'YYYY-MM-DD HH:mm:ss', 'Asia/Colombo');
      
      if (!parsed.isValid()) {
        console.error('Failed to parse SL datetime:', start_datetime_sl);
        return null;
      }
      
      return parsed;
    } catch (error) {
      console.error('Error parsing SL datetime:', error);
      return null;
    }
  };

  // Format to display time
  const formatToSLTime = (dateTime) => {
    try {
      if (!dateTime) return 'Invalid date';
      if (moment.isMoment(dateTime)) {
        return dateTime.format('DD MMM YYYY, h:mm:ss A');
      }
      return moment(dateTime).tz('Asia/Colombo').format('DD MMM YYYY, h:mm:ss A');
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  // Check if auction is live - SIMPLIFIED VERSION using backend data
  const isAuctionLive = useCallback((auctionItem) => {
    if (!auctionItem) return false;
    
    try {
      // Use the backend's calculation
      return auctionItem.calculated_status === 'live' && auctionItem.is_live === true;
    } catch (error) {
      console.error('Error checking auction status:', error);
      return false;
    }
  }, []);

  // Fetch live auction data
  const fetchLiveAuction = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Please login to access auctions');
      }

      const response = await fetch('http://localhost:5000/api/auction/live/bidder', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.status === 401) {
        localStorage.removeItem('token');
        throw new Error('Session expired. Please login again.');
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch live auction: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Fetched auction data:', data); // Debug log
      
      return {
        auctions: Array.isArray(data.auctions) ? data.auctions : [],
        futureAuctions: Array.isArray(data.future_auctions) ? data.future_auctions : [],
        pastAuctions: Array.isArray(data.past_auctions) ? data.past_auctions : []
      };
    } catch (error) {
      console.error('Error fetching live auction:', error);
      throw error;
    }
  }, []);

  // Fetch auction data - UPDATED VERSION
  const fetchAuctionData = useCallback(async () => {
    try {
      setHasError(false);
      const { auctions, futureAuctions } = await fetchLiveAuction();
      
      // Find live auction from the live auctions array
      let liveAuction = null;
      
      if (auctions && auctions.length > 0) {
        liveAuction = auctions.find(auc => 
          auc.calculated_status === 'live' && auc.is_live === true
        );
      }
      
      if (!liveAuction) {
        setAuction(null);
        setBidderInfo({ rank: null, latestBid: null, totalBidders: 0 });
        console.log('No live auction found');
        
        // Check if there are upcoming auctions
        if (futureAuctions && futureAuctions.length > 0) {
          console.log('Found future auctions:', futureAuctions.length);
        }
        return;
      }

      console.log('Found live auction:', liveAuction);
      setAuction(liveAuction);
      
      // Fetch additional data for the live auction
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
      } else {
        showAlert(`Error fetching auction data: ${error.message}`, 'danger');
      }
    } finally {
      setInitialLoading(false);
    }
  }, [showAlert]);

  // Place bid
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

  // Fetch bidder rank
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

  // Fetch latest bid
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

  // Update timer - FIXED VERSION using backend provided times
  const updateTimer = useCallback(() => {
    if (!auction) return;

    try {
      const now = moment().tz('Asia/Colombo');
      
      // Use the end time provided by backend
      let auctionEnd;
      if (auction.end_datetime_sl && auction.end_datetime_sl !== 'Invalid date') {
        auctionEnd = parseSLDateTime(auction.end_datetime_sl);
      } else if (auction.time_remaining_ms && auction.time_remaining_ms > 0) {
        // Fallback: calculate end time from remaining time
        auctionEnd = now.clone().add(auction.time_remaining_ms, 'milliseconds');
      } else {
        setTimeLeft('Auction Ended');
        return;
      }
      
      if (!auctionEnd || !auctionEnd.isValid()) {
        setTimeLeft('Invalid time');
        return;
      }

      const timeRemaining = moment.duration(auctionEnd.diff(now));
      setCurrentTimeSL(now.format('DD MMM YYYY, h:mm:ss A'));
      
      console.log('Timer update:', {
        now: now.format(),
        auctionEnd: auctionEnd.format(),
        timeRemainingMs: timeRemaining.asMilliseconds(),
        backendTimeRemaining: auction.time_remaining_ms
      }); // Debug log
      
      if (timeRemaining.asMilliseconds() <= 0) {
        setTimeLeft('Auction Ended');
        // Refresh auction data when auction ends
        setTimeout(() => fetchAuctionData(), 1000);
      } else {
        const totalSeconds = Math.floor(timeRemaining.asSeconds());
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        setTimeLeft(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }
    } catch (error) {
      console.error('Error updating timer:', error);
      setTimeLeft('Error');
    }
  }, [auction, fetchAuctionData]);

  // Effects
  useEffect(() => {
    fetchAuctionData();
    setCurrentTimeSL(getCurrentSLTime());
    
    // Refresh auction data every 30 seconds
    const interval = setInterval(() => {
      fetchAuctionData();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [fetchAuctionData]);

  useEffect(() => {
    if (auction) {
      updateTimer();
      const timer = setInterval(updateTimer, 1000);
      return () => clearInterval(timer);
    }
  }, [auction, updateTimer]);

  useEffect(() => {
    const timeTimer = setInterval(() => {
      setCurrentTimeSL(getCurrentSLTime());
    }, 1000);
    
    return () => clearInterval(timeTimer);
  }, []);

  // Handle place bid
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
      
      setBidderInfo(prev => ({
        ...prev,
        latestBid: parseFloat(bidAmount),
        rank: result.rank || prev.rank
      }));
      
      // Refresh auction data after placing bid
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
          message="Currently there are no live auctions available to you. Please check back later. when the auction start"
          type="info"
        />
        <button 
          className="btn btn-outline-primary mt-3" 
          onClick={() => fetchAuctionData()}
          disabled={loading}
        >
          {/*{loading ? 'Refreshing...' : 'Refresh'}*/}
        </button>
      </div>
    );
  }

  const auctionStatus = auction.calculated_status || 'unknown';
  const auctionStart = parseSLDateTime(auction.start_datetime_sl);
  const auctionEnd = parseSLDateTime(auction.end_datetime_sl);

  return (
    <div className="live-auction">
      <h2>Live Auction</h2>
      
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
            <p><strong>Start Date/Time:</strong>{auctionStart ? formatToSLTime(auctionStart) : 'Invalid date'}</p>
            <p><strong>End Date/Time:</strong>{auctionEnd ? formatToSLTime(auctionEnd) : 'Invalid date'}</p>
            <p><strong>Duration:</strong> {auction.duration_minutes} minutes</p>  
            <p><strong>Time Until End:</strong>{auction.time_until_end}</p> 
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