import React, { useState, useEffect, useCallback } from 'react';
import Card from '../Common/Card';
import Alert from '../Common/Alert';

const API_URL = 'http://localhost:5000/api';
//const API_URL = 'https://procubid.anunine.com/api'

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

  // Update timer for selected auction using server-provided time data
  const updateTimer = useCallback(() => {
    if (!selectedAuction || !selectedAuction.time_remaining_ms) {
      setTimeLeft('00:00');
      return;
    }

    // Calculate time remaining from the last fetched data
    const timeRemaining = Math.max(0, selectedAuction.time_remaining_ms - 
      (Date.now() - (selectedAuction.last_fetched || Date.now())));
    
    if (timeRemaining <= 0) {
      setTimeLeft('00:00');
      fetchLiveAuctions(); // Refresh when auction ends
    } else {
      const minutes = Math.floor(timeRemaining / 60000);
      const seconds = Math.floor((timeRemaining % 60000) / 1000);
      setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }
  }, [selectedAuction]);

  // Fetch live auctions - FIXED URL
  const fetchLiveAuctions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      // FIXED: Correct API endpoint path
      const response = await fetch(`${API_URL}/auction/live/admin`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch live auctions: ${response.status}`);
      }

      const data = await response.json();
      console.log('Live auctions response:', data); // Debug log
      
      if (data.success) {
        // Mark when data was fetched for timer calculations
        const auctionsWithTimestamp = data.auctions.map(auction => ({
          ...auction,
          last_fetched: Date.now()
        }));
        
        setLiveAuctions(auctionsWithTimestamp);
        
        // Auto-select first live auction
        if (auctionsWithTimestamp.length > 0 && !selectedAuction) {
          setSelectedAuction(auctionsWithTimestamp[0]);
        } else if (auctionsWithTimestamp.length === 0) {
          setSelectedAuction(null);
          setRankings([]);
        }
        
        setError(null); // Clear any previous errors
      } else {
        throw new Error(data.message || 'Failed to fetch live auctions');
      }
    } catch (err) {
      console.error('Error fetching live auctions:', err);
      setError(`Failed to fetch live auctions: ${err.message}`);
    }
  }, [selectedAuction]);

  // Fetch rankings for selected auction - FIXED URL
  const fetchRankings = useCallback(async (auctionId) => {
    if (!auctionId) return;

    try {
      const token = localStorage.getItem('token');
      // FIXED: Correct API endpoint path
      const response = await fetch(`${API_URL}/auction/live/${auctionId}/rankings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch rankings: ${response.status}`);
      }

      const data = await response.json();
      console.log('Rankings response:', data); // Debug log
      
      if (data.success) {
        setRankings(data.rankings || []);
        setError(null);
      } else {
        throw new Error(data.message || 'Failed to fetch rankings');
      }
    } catch (err) {
      console.error('Error fetching rankings:', err);
      setError(`Failed to fetch rankings: ${err.message}`);
    }
  }, []);

// Fetch overall results - CORRECTED VERSION
const fetchOverallResults = useCallback(async () => {
  try {
    const token = localStorage.getItem('token');
    
    const response = await fetch(`${API_URL}/auction/results/overview`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch auction results: ${response.status}`);
    }

    const data = await response.json();
    console.log('Overall results response:', data);
    
    if (data.success && data.auctionResults) {
      // Map the API response to match your table structure
      const formattedResults = data.auctionResults.map(result => ({
        auction_id: result["Auction ID"],
        title: result["Title"],
        winning_bidder_id: result["Bidder User ID"], // Show the user-friendly ID
        bidder_name: result["Bidder Name"],
        winning_price: result["Latest Bidding Price"],
        winning_bidder_company: result["Company"],
        winning_bidder_email: result["Email"],
        
      }));
      
      setOverallResults(formattedResults);
      setError(null);
    } else {
      throw new Error(data.message || 'No auction results found');
    }
  } catch (err) {
    console.error('Error fetching overall results:', err);
    setError(`Failed to fetch auction results: ${err.message}`);
    setOverallResults([]);
  }
}, []);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        if (activeTab === 'liveRankings') {
          await fetchLiveAuctions();
        } else if (activeTab === 'overallResults') {
          await fetchOverallResults();
        }
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [activeTab]); // Reload when tab changes

  // Auto-refresh live data
  useEffect(() => {
    if (activeTab !== 'liveRankings') return;

    const interval = setInterval(() => {
      fetchLiveAuctions();
      if (selectedAuction) {
        fetchRankings(selectedAuction.auction_id || selectedAuction.id);
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
    fetchRankings(auction.auction_id || auction.id);
  };

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError(null); // Clear errors when switching tabs
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
            onClick={() => handleTabChange('liveRankings')}
          >
            <i className="fas fa-trophy me-2"></i>
            Live Rankings
          </button>
        </li>
        <li className="nav-item">
          <button 
            className={`nav-link ${activeTab === 'overallResults' ? 'active' : ''}`}
            onClick={() => handleTabChange('overallResults')}
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
                  <p className="text-muted">No live auctions currently active</p>
                  <button 
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => fetchLiveAuctions()}
                  >
                    <i className="fas fa-sync-alt me-1"></i>
                    Refresh
                  </button>
                </div>
              ) : (
                <div className="list-group">
                  {liveAuctions.map((auction) => (
                    <button
                      key={auction.id || auction.auction_id}
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
                            Duration: {auction.duration_minutes} min
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

                  {/* Auction Stats 
                  <div className="row mb-3">
                    <div className="col-md-3">
                      <div className="text-center p-2 bg-light rounded">
                        <div className="h6 mb-0">{selectedAuction.invited_bidders || 0}</div>
                        <small className="text-muted">Invited</small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="text-center p-2 bg-light rounded">
                        <div className="h6 mb-0">{selectedAuction.active_bidders || selectedAuction.active_bidder_count || 0}</div>
                        <small className="text-muted">Active</small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="text-center p-2 bg-light rounded">
                        <div className="h6 mb-0">{selectedAuction.total_bids || 0}</div>
                        <small className="text-muted">Total Bids</small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="text-center p-2 bg-light rounded">
                        <div className="h6 mb-0">{selectedAuction.participation_rate || 0}%</div>
                        <small className="text-muted">Participation</small>
                      </div>
                    </div>
                  </div>*/}

                  <div className="table-responsive">
                    <table className="table table-bordered table-hover">
                      <thead className="table-dark">
                        <tr>
                          <th>Rank</th>
                          <th>Bidder ID</th>
                          <th>Bidder Name</th>
                          <th>Company</th>
                          <th>Best Bid</th>
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
                                  #{ranking.rank}
                                </strong>
                              </td>
                              <td><strong>{ranking.user_id}</strong></td>
                              <td>{ranking.name}</td>
                              <td><small>{ranking.company || 'N/A'}</small></td>
                              <td>
                                <strong className="text-primary">
                                  {formatCurrency(ranking.amount)}
                                </strong>
                              </td>
                              <td>
                                <small>{formatTime(ranking.bid_time)}</small>
                              </td>
                              <td>
                                <span className={`badge ${index === 0 ? 'bg-success' : 'bg-secondary'}`}>
                                  <i className="fas fa-circle me-1" style={{fontSize: '8px'}}></i>
                                  {index === 0 ? 'LEADING' : 'Active'}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="7" className="text-center text-muted p-4">
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
        <Card title="Overall Results Overview">
          <br></br>
          <div className="table-responsive">
            <table className="table table-bordered table-striped">
              <thead className="table-dark">
                <tr>
                  <th>Auction ID</th>
                  <th>Title</th>
                  <th>Bidder ID</th>
                  <th>Bidder Name</th>
                  <th>Awarded Bidding Price</th>
                  <th>Bidder's Company</th>
                  <th>Bidder's Email</th>

                  
                  
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
                      <td>{result.winning_bidder_company || 'N/A'}</td>
                      <td>{result.winning_bidder_email || 'N/A'}</td>
                      
                      
                    </tr>
                  ))
                ) : (
                  <tr>
                    
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3">
            <div className="row">
              <div className="col-md-6">
                <small className="text-muted">
                  Showing {overallResults.length} auction result{overallResults.length !== 1 ? 's' : ''}
                </small>
              </div>
              
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default LiveRankings;