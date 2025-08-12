import React, { useState, useEffect, useCallback } from 'react';
import Card from '../Common/Card';
import Alert from '../Common/Alert';

const LiveRankings = () => {
  const [activeTab, setActiveTab] = useState('liveRankings');
  const [liveAuctions, setLiveAuctions] = useState([]);
  const [selectedAuction, setSelectedAuction] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [overallResults, setOverallResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeLeft, setTimeLeft] = useState('00:00');

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format time
  const formatTime = (dateTimeString) => {
    return new Date(dateTimeString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  // Check if auction is live
  const isAuctionLive = useCallback((auction) => {
    const now = new Date();
    const auctionStart = new Date(`${auction.auction_date}T${auction.start_time}`);
    const auctionEnd = new Date(auctionStart.getTime() + auction.duration_minutes * 60000);
    return now >= auctionStart && now <= auctionEnd;
  }, []);

  // Update timer for selected auction
  const updateTimer = useCallback(() => {
    if (!selectedAuction) return;

    const now = new Date();
    const auctionStart = new Date(`${selectedAuction.auction_date}T${selectedAuction.start_time}`);
    const auctionEnd = new Date(auctionStart.getTime() + selectedAuction.duration_minutes * 60000);
    const timeRemaining = auctionEnd - now;
    
    if (timeRemaining <= 0) {
      setTimeLeft('00:00');
      fetchLiveAuctions(); // Refresh when auction ends
    } else {
      const minutes = Math.floor(timeRemaining / 60000);
      const seconds = Math.floor((timeRemaining % 60000) / 1000);
      setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }
  }, [selectedAuction]);

  // Fetch live auctions
  const fetchLiveAuctions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/admin/auctions/live', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch live auctions');
      }

      const data = await response.json();
      if (data.success) {
        const liveAuctionsList = data.auctions.filter(auction => isAuctionLive(auction));
        setLiveAuctions(liveAuctionsList);
        
        // Auto-select first live auction
        if (liveAuctionsList.length > 0 && !selectedAuction) {
          setSelectedAuction(liveAuctionsList[0]);
        } else if (liveAuctionsList.length === 0) {
          setSelectedAuction(null);
          setRankings([]);
        }
      }
    } catch (err) {
      console.error('Error fetching live auctions:', err);
      setError('Failed to fetch live auctions');
    }
  }, [isAuctionLive, selectedAuction]);

  // Fetch rankings for selected auction
  const fetchRankings = useCallback(async (auctionId) => {
    if (!auctionId) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/admin/auctions/${auctionId}/rankings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch rankings');
      }

      const data = await response.json();
      if (data.success) {
        setRankings(data.rankings || []);
      }
    } catch (err) {
      console.error('Error fetching rankings:', err);
      setError('Failed to fetch rankings');
    }
  }, []);

  // Fetch overall results
  const fetchOverallResults = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/admin/auctions/results', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch overall results');
      }

      const data = await response.json();
      if (data.success) {
        setOverallResults(data.results || []);
      }
    } catch (err) {
      console.error('Error fetching overall results:', err);
      setError('Failed to fetch overall results');
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchLiveAuctions(),
          fetchOverallResults()
        ]);
      } catch (err) {
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Auto-refresh live data
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'liveRankings') {
        fetchLiveAuctions();
        if (selectedAuction) {
          fetchRankings(selectedAuction.id);
        }
      }
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [activeTab, selectedAuction, fetchLiveAuctions, fetchRankings]);

  // Timer update
  useEffect(() => {
    if (selectedAuction && activeTab === 'liveRankings') {
      updateTimer();
      const timer = setInterval(updateTimer, 1000);
      return () => clearInterval(timer);
    }
  }, [selectedAuction, activeTab, updateTimer]);

  // Handle auction selection
  const handleAuctionSelect = (auction) => {
    setSelectedAuction(auction);
    fetchRankings(auction.id);
  };

  if (loading) {
    return (
      <div className="text-center p-4">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-2">Loading auction data...</p>
      </div>
    );
  }

  return (
    <div className="live-rankings">
      {/* Tab Navigation */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button 
            className={`nav-link ${activeTab === 'liveRankings' ? 'active' : ''}`}
            onClick={() => setActiveTab('liveRankings')}
          >
            <i className="fas fa-trophy me-2"></i>
            Live Rankings
          </button>
        </li>
        <li className="nav-item">
          <button 
            className={`nav-link ${activeTab === 'overallResults' ? 'active' : ''}`}
            onClick={() => setActiveTab('overallResults')}
          >
            <i className="fas fa-chart-line me-2"></i>
            Overall Results
          </button>
        </li>
      </ul>

      {error && (
        <Alert message={error} type="danger" onClose={() => setError(null)} />
      )}

      {/* Live Rankings Tab */}
      {activeTab === 'liveRankings' && (
        <div className="row">
          {/* Auction Selection */}
          <div className="col-md-4">
            <Card title="Live Auctions">
              {liveAuctions.length === 0 ? (
                <div className="text-center p-3">
                  <i className="fas fa-clock fa-2x text-muted mb-2"></i>
                  <p className="text-muted">No live auctions</p>
                </div>
              ) : (
                <div className="list-group">
                  {liveAuctions.map((auction) => (
                    <button
                      key={auction.id}
                      className={`list-group-item list-group-item-action ${
                        selectedAuction?.id === auction.id ? 'active' : ''
                      }`}
                      onClick={() => handleAuctionSelect(auction)}
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <h6 className="mb-1">{auction.auction_id}</h6>
                          <p className="mb-1 small">{auction.title}</p>
                          <small className="text-muted">
                            Started: {formatTime(`${auction.auction_date}T${auction.start_time}`)}
                          </small>
                        </div>
                        <span className="badge bg-success">LIVE</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Live Rankings */}
          <div className="col-md-8">
            <Card>
              {selectedAuction ? (
                <>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                      <h5 className="mb-0">{selectedAuction.title}</h5>
                      <small className="text-muted">Auction ID: {selectedAuction.auction_id}</small>
                    </div>
                    <div className="text-center">
                      <div className="display-6 fw-bold text-primary">{timeLeft}</div>
                      <small className="text-muted">Time Remaining</small>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table table-bordered table-hover">
                      <thead className="table-dark">
                        <tr>
                          <th>Rank</th>
                          <th>Bidder ID</th>
                          <th>Bidder Name</th>
                          <th>Latest Bid</th>
                          <th>Bid Time</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankings.length > 0 ? (
                          rankings.map((ranking, index) => (
                            <tr key={ranking.bidder_id} className={index === 0 ? 'table-success' : ''}>
                              <td>
                                <strong className={index === 0 ? 'text-success' : ''}>
                                  {index === 0 && <i className="fas fa-crown me-1"></i>}
                                  #{index + 1}
                                </strong>
                              </td>
                              <td><strong>{ranking.user_id}</strong></td>
                              <td>{ranking.name}</td>
                              <td>
                                <strong className="text-primary">
                                  {formatCurrency(ranking.amount)}
                                </strong>
                              </td>
                              <td>
                                <small>{formatTime(ranking.bid_time)}</small>
                              </td>
                              <td>
                                <span className="badge bg-success">
                                  <i className="fas fa-circle me-1" style={{fontSize: '8px'}}></i>
                                  Active
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" className="text-center text-muted p-4">
                              <i className="fas fa-info-circle me-2"></i>
                              No bids placed yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {rankings.length > 0 && (
                    <div className="mt-3">
                      <small className="text-muted">
                        <i className="fas fa-info-circle me-1"></i>
                        Rankings update automatically every 5 seconds. Lowest bid wins in reverse auction.
                      </small>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center p-4">
                  <i className="fas fa-gavel fa-3x text-muted mb-3"></i>
                  <h5 className="text-muted">No Live Auction Selected</h5>
                  <p className="text-muted">Select a live auction from the left panel to view rankings.</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Overall Results Tab */}
      {activeTab === 'overallResults' && (
        <Card title="Auction Results Overview">
          <div className="table-responsive">
            <table className="table table-bordered table-striped">
              <thead className="table-dark">
                <tr>
                  <th>Auction ID</th>
                  <th>Title</th>
                  <th>Winning Bidder ID</th>
                  <th>Bidder Name</th>
                  <th>Winning Bidding Price</th>
                  <th>Auction Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {overallResults.length > 0 ? (
                  overallResults.map((result, index) => (
                    <tr key={`${result.auction_id}-${index}`}>
                      <td><strong>{result.auction_id}</strong></td>
                      <td>{result.title}</td>
                      <td>
                        <strong className="text-primary">
                          {result.winning_bidder_id || 'N/A'}
                        </strong>
                      </td>
                      <td>
                        {result.bidder_name || 'No Winner'}
                      </td>
                      <td>
                        {result.winning_price ? (
                          <strong className="text-success">
                            {formatCurrency(result.winning_price)}
                          </strong>
                        ) : (
                          <span className="text-muted">No Bids</span>
                        )}
                      </td>
                      <td>
                        <small>
                          {new Date(result.auction_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </small>
                      </td>
                      <td>
                        <span className={`badge ${
                          result.status === 'completed' ? 'bg-success' : 
                          result.status === 'cancelled' ? 'bg-danger' : 
                          'bg-warning'
                        }`}>
                          {result.status?.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="text-center text-muted p-4">
                      <i className="fas fa-chart-line fa-2x mb-2"></i>
                      <div>No auction results available</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {overallResults.length > 0 && (
            <div className="mt-3">
              <div className="row">
                <div className="col-md-6">
                  <small className="text-muted">
                    Showing {overallResults.length} auction result{overallResults.length > 1 ? 's' : ''}
                  </small>
                </div>
                <div className="col-md-6 text-end">
                  <button 
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => {
                      fetchOverallResults();
                    }}
                  >
                    <i className="fas fa-sync-alt me-1"></i>
                    Refresh
                  </button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default LiveRankings;