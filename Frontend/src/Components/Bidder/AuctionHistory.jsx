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
      case 'disqualified':
        return 'bg-danger';
      case 'not_awarded':
        return 'bg-secondary';
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
      'disqualified': 'Disqualified ❌',
      'not_awarded': 'Not Awarded',
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

      // FIXED: Use the correct endpoint without bidderId parameter
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
          bid_amount: item["Bid Amount"],
          result: item["Result"],
          raw_status: item["Raw Status"],
          date_time: item["Date Time"],
          disqualification_reason: item["Disqualification Reason"]
        }));
        
        setHistory(formattedHistory);
        
        // Calculate summary from the data
        const auctionsWon = formattedHistory.filter(item => item.raw_status === 'awarded').length;
        const totalAuctions = formattedHistory.length;
        
        setSummary({
          total_auctions_participated: totalAuctions,
          auctions_won: auctionsWon,
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
              {summary.total_auctions_participated} auctions • {summary.auctions_won} awarded • {summary.win_rate}% success rate
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
          <div className="table-responsive">
            <table className="table table-bordered table-striped table-hover">
              <thead className="table-dark">
                <tr>
                  <th>Auction ID</th>
                  <th>Title</th>
                  <th>Bid Amount</th>
                  <th>Result</th>
                  <th>Date Time</th>
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
                        {item.raw_status === 'disqualified' && <i className="fas fa-times me-1"></i>}
                        {item.raw_status === 'not_awarded' && <i className="fas fa-times-circle me-1"></i>}
                        {item.raw_status === 'pending' && <i className="fas fa-clock me-1"></i>}
                        {item.result}
                      </span>
                      {item.disqualification_reason && (
                        <div className="mt-1">
                          <small className="text-muted">
                            <i className="fas fa-info-circle me-1"></i>
                            {item.disqualification_reason}
                          </small>
                        </div>
                      )}
                    </td>
                    <td>
                      <small className="text-muted">
                        {item.date_time || 'Date not available'}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary info */}
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