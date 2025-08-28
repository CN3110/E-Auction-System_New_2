import React, { useState, useEffect, useCallback } from 'react';
import Alert from '../Common/Alert';

const AuctionHistory = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Get result badge class based on auction_results status
  const getResultBadgeClass = (resultStatus) => {
    switch (resultStatus?.toLowerCase()) {
      case 'awarded':
        return 'bg-success';
      case 'short-listed':
        return 'bg-info';
      case 'not-short-listed':
        return 'bg-warning';
      case 'disqualified':
        return 'bg-danger';
      case 'not_awarded':
        return 'bg-secondary';
      case 'cancel':
      case 'cancelled':
        return 'bg-dark';
      case 'pending':
        return 'bg-warning';
      default:
        return 'bg-secondary';
    }
  };

  // Format result status for display
  const formatResultStatus = (resultStatus) => {
    const statusMap = {
      'awarded': 'Awarded 🎉',
      'short-listed': 'Short-Listed 📋',
      'not-short-listed': 'Not Short-Listed',
      'disqualified': 'Disqualified ❌',
      'not_awarded': 'Not Awarded',
      'cancel': 'Cancelled 🚫',
      'cancelled': 'Cancelled 🚫',
      'pending': 'Pending Review'
    };
    return statusMap[resultStatus] || resultStatus;
  };

  // Fetch auction history from backend
  const fetchAuctionHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      const response = await fetch(
        `http://localhost:5000/api/auction/results/bidder/results`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch auction results');
      }

      const data = await response.json();
      
      if (data.success) {
        // Map the API response to match your table structure
        const formattedHistory = data.auctionResults.map(item => ({
          auction_id: item["Auction ID"],
          title: item["Title"],
          bid_amount: item["Best Bid Amount"],
          result: item["Result"],
          raw_status: item["Raw Status"],
          date_time: item["Date Time"],
          disqualification_reason: item["Disqualification Reason"],
          cancel_reason: item["Cancel Reason"],
          shortlisted_at: item["Shortlisted At"]
        }));
        
        setHistory(formattedHistory);
        
        // Calculate summary from the data
        const auctionsWon = formattedHistory.filter(item => item.raw_status === 'awarded').length;
        const auctionsShortlisted = formattedHistory.filter(item => item.raw_status === 'short-listed').length;
        const totalAuctions = formattedHistory.length;
        
        setSummary({
          total_auctions_participated: totalAuctions,
          auctions_won: auctionsWon,
          auctions_shortlisted: auctionsShortlisted,
          win_rate: totalAuctions > 0 ? Math.round((auctionsWon / totalAuctions) * 100) : 0
        });

      } else {
        throw new Error(data.message || 'Failed to fetch auction results');
      }

    } catch (err) {
      console.error('Error fetching auction results:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAuctionHistory();
  }, [fetchAuctionHistory]);

  // Refresh data
  const handleRefresh = () => {
    fetchAuctionHistory();
  };

  if (loading && history.length === 0) {
    return (
      <div className="auction-history">
        <h4 className="mb-3">Your Auction Results</h4>
        <div className="text-center p-4">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Loading your auction results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auction-history">
        <h4 className="mb-3">Your Auction Results</h4>
        <Alert 
          message={`Error loading auction results: ${error}`} 
          type="danger" 
        />
        <button 
          className="btn btn-primary mt-2" 
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Try Again'}
        </button>
      </div>
    );
  }

  return (
    <div className="auction-history">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="mb-0">Your Auction Results</h4>
          {summary && (
            <small className="text-muted">
              {summary.total_auctions_participated} auctions • {summary.auctions_won} awarded • {summary.auctions_shortlisted} shortlisted • {summary.win_rate}% success rate
            </small>
          )}
        </div>
        <button 
          className="btn btn-outline-primary btn-sm" 
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm me-1" role="status"></span>
              Refreshing...
            </>
          ) : (
            <>
              <i className="fas fa-sync-alt me-1"></i>
              Refresh
            </>
          )}
        </button>
      </div>

      {history.length === 0 ? (
        <div className="text-center p-5">
          <div className="mb-3">
            <i className="fas fa-history fa-3x text-muted"></i>
          </div>
          <h5 className="text-muted">No Auction Results</h5>
          <p className="text-muted">
            You haven't participated in any auctions yet.
            <br />
            Check the Live Auction tab to join active auctions.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          {summary && (
            <div className="row mb-4">
              <div className="col-md-3">
                <div className="card text-center">
                  <div className="card-body">
                    <h5 className="card-title text-primary">{summary.total_auctions_participated}</h5>
                    <p className="card-text small">Total Participated</p>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card text-center">
                  <div className="card-body">
                    <h5 className="card-title text-success">{summary.auctions_won}</h5>
                    <p className="card-text small">Awarded</p>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card text-center">
                  <div className="card-body">
                    <h5 className="card-title text-info">{summary.auctions_shortlisted}</h5>
                    <p className="card-text small">Shortlisted</p>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card text-center">
                  <div className="card-body">
                    <h5 className="card-title text-warning">{summary.win_rate}%</h5>
                    <p className="card-text small">Success Rate</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="table-responsive">
            <table className="table table-bordered table-striped table-hover">
              <thead className="table-dark">
                <tr>
                  <th>Auction ID</th>
                  <th>Title</th>
                  <th>Bid Amount</th>
                  <th>Result</th>
                  
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item, index) => (
                  <tr key={`${item.auction_id}-${index}`}>
                    <td>
                      <strong>{item.auction_id || 'N/A'}</strong>
                    </td>
                    <td>
                      <div className="fw-medium">{item.title || 'Untitled Auction'}</div>
                    </td>
                    <td>
                      <strong className="text-primary">
                        {formatCurrency(item.bid_amount)}
                      </strong>
                    </td>
                    <td>
                      <span className={`badge ${getResultBadgeClass(item.raw_status)}`}>
                        {item.raw_status === 'awarded' && <i className="fas fa-trophy me-1"></i>}
                        {item.raw_status === 'short-listed' && <i className="fas fa-list me-1"></i>}
                        {item.raw_status === 'not-short-listed' && <i className="fas fa-times-circle me-1"></i>}
                        {item.raw_status === 'disqualified' && <i className="fas fa-times me-1"></i>}
                        {item.raw_status === 'not_awarded' && <i className="fas fa-times-circle me-1"></i>}
                        {(item.raw_status === 'cancel' || item.raw_status === 'cancelled') && <i className="fas fa-ban me-1"></i>}
                        {item.raw_status === 'pending' && <i className="fas fa-clock me-1"></i>}
                        {item.result}
                      </span>
                    </td>
                    
                    <td>
                      <div className="d-flex flex-column gap-1">
                        {/* Shortlist Notice */}
                        {item.raw_status === 'short-listed' && (
                          <div className="alert alert-info alert-sm p-1 mb-1">
                            <small>
                              <i className="fas fa-info-circle me-1"></i>
                              <strong>Congratulations!</strong> You've been shortlisted. Please prepare your quotation.
                            </small>
                          </div>
                        )}

                        {/* Disqualification Reason */}
                        {item.disqualification_reason && (
                          <div className="alert alert-danger alert-sm p-1 mb-1">
                            <small>
                              <strong>Reason:</strong> {item.disqualification_reason}
                            </small>
                          </div>
                        )}

                        {/* Cancellation Reason */}
                        {item.cancel_reason && (
                          <div className="alert alert-warning alert-sm p-1 mb-1">
                            <small>
                              <strong>Cancelled:</strong> {item.cancel_reason}
                            </small>
                          </div>
                        )}

                        {/* Award Notice */}
                        {item.raw_status === 'awarded' && (
                          <div className="alert alert-success alert-sm p-1 mb-1">
                            <small>
                              <i className="fas fa-trophy me-1"></i>
                              <strong>Congratulations!</strong> You won this auction. Our team will contact you soon.
                            </small>
                          </div>
                        )}

                        {/* Not Shortlisted Notice */}
                        {item.raw_status === 'not-short-listed' && (
                          <div className="alert alert-secondary alert-sm p-1 mb-1">
                            <small>
                              <i className="fas fa-info-circle me-1"></i>
                              You were not selected for the shortlist this time.
                            </small>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Results Summary 
          <div className="mt-3">
            <div className="row">
              <div className="col-md-12">
                <div className="alert alert-light">
                  <div className="row text-center">
                    <div className="col-md-3">
                      <small className="text-muted">
                        <strong>Status Legend:</strong>
                      </small>
                    </div>
                    <div className="col-md-2">
                      <span className="badge bg-info">📋 Short-Listed</span>
                    </div>
                    <div className="col-md-2">
                      <span className="badge bg-success">🎉 Awarded</span>
                    </div>
                    <div className="col-md-2">
                      <span className="badge bg-warning">❌ Not Short-Listed</span>
                    </div>
                    <div className="col-md-2">
                      <span className="badge bg-danger">🚫 Disqualified</span>
                    </div>
                    <div className="col-md-1">
                      <span className="badge bg-dark">🚫 Cancelled</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div> */}

          <div className="mt-3">
            <div className="row">
              <div className="col-md-12 text-center">
                <small className="text-muted">
                  Showing {history.length} auction result{history.length !== 1 ? 's' : ''}
                </small>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AuctionHistory;