import React, { useState, useEffect, useCallback } from 'react';
import Alert from '../Common/Alert';

const AuctionHistory = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    limit: 10
  });
  const [summary, setSummary] = useState(null);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format date and time in one column
  const formatDateTime = (dateTimeString) => {
    try {
      const dateTime = new Date(dateTimeString);
      const date = dateTime.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      const time = dateTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return `${date} ${time}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  // Get result badge class
  const getResultBadgeClass = (result) => {
    switch (result?.toLowerCase()) {
      case 'won':
        return 'bg-success';
      case 'lost':
        return 'bg-danger';
      case 'in progress':
        return 'bg-primary';
      case 'pending':
        return 'bg-warning';
      case 'cancelled':
        return 'bg-secondary';
      default:
        return 'bg-secondary';
    }
  };

  // Fetch auction history from backend
  const fetchAuctionHistory = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      const response = await fetch(
        `http://localhost:5000/api/bid/history?page=${page}&limit=${pagination.limit}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch auction history');
      }

      const data = await response.json();
      
      if (data.success) {
        setHistory(data.history || []);
        setSummary(data.summary || null);
        
        // Update pagination if backend provides it
        if (data.pagination) {
          setPagination(prev => ({
            ...prev,
            currentPage: data.pagination.currentPage,
            totalPages: data.pagination.totalPages
          }));
        }
      } else {
        throw new Error(data.error || 'Failed to fetch auction history');
      }

    } catch (err) {
      console.error('Error fetching auction history:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pagination.limit]);

  // Initial load
  useEffect(() => {
    fetchAuctionHistory(1);
  }, []);

  // Handle page change
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, currentPage: newPage }));
      fetchAuctionHistory(newPage);
    }
  };

  // Refresh data
  const handleRefresh = () => {
    fetchAuctionHistory(pagination.currentPage);
  };

  if (loading && history.length === 0) {
    return (
      <div className="auction-history">
        <h4 className="mb-3">Your Auction History</h4>
        <div className="text-center p-4">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Loading your auction history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auction-history">
        <h4 className="mb-3">Your Auction History</h4>
        <Alert 
          message={`Error loading auction history: ${error}`} 
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
          <h4 className="mb-0">Your Auction History</h4>
          {summary && (
            <small className="text-muted">
              {summary.total_auctions_participated} auctions • {summary.auctions_won} won • {summary.total_bids_placed} total bids
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
          <h5 className="text-muted">No Auction History</h5>
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
                      <strong>{item.auctions?.auction_id || 'N/A'}</strong>
                    </td>
                    <td>
                      <div>
                        {item.auctions?.title || 'Untitled Auction'}
                      </div>
                    </td>
                    <td>
                      <strong className="text-primary">
                        {formatCurrency(item.amount)}
                      </strong>
                      <div>
                        <small className="text-muted">Last bid</small>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${getResultBadgeClass(item.result)}`}>
                        {item.result === 'Won' && <i className="fas fa-trophy me-1"></i>}
                        {item.result === 'Lost' && <i className="fas fa-times me-1"></i>}
                        {item.result === 'In Progress' && <i className="fas fa-clock me-1"></i>}
                        {item.result === 'Pending' && <i className="fas fa-hourglass-half me-1"></i>}
                        {item.result === 'Cancelled' && <i className="fas fa-ban me-1"></i>}
                        {item.result}
                      </span>
                    </td>
                    <td>
                      <div className="small">
                        {formatDateTime(item.bid_time)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <nav aria-label="Auction history pagination">
              <ul className="pagination justify-content-center">
                <li className={`page-item ${pagination.currentPage === 1 ? 'disabled' : ''}`}>
                  <button 
                    className="page-link" 
                    onClick={() => handlePageChange(pagination.currentPage - 1)}
                    disabled={pagination.currentPage === 1 || loading}
                  >
                    Previous
                  </button>
                </li>
                
                {[...Array(pagination.totalPages)].map((_, index) => {
                  const pageNumber = index + 1;
                  return (
                    <li 
                      key={pageNumber} 
                      className={`page-item ${pagination.currentPage === pageNumber ? 'active' : ''}`}
                    >
                      <button 
                        className="page-link" 
                        onClick={() => handlePageChange(pageNumber)}
                        disabled={loading}
                      >
                        {pageNumber}
                      </button>
                    </li>
                  );
                })}
                
                <li className={`page-item ${pagination.currentPage === pagination.totalPages ? 'disabled' : ''}`}>
                  <button 
                    className="page-link" 
                    onClick={() => handlePageChange(pagination.currentPage + 1)}
                    disabled={pagination.currentPage === pagination.totalPages || loading}
                  >
                    Next
                  </button>
                </li>
              </ul>
            </nav>
          )}

          {/* Summary info */}
          <div className="mt-3">
            <div className="row">
              <div className="col-md-8">
                <small className="text-muted">
                  Showing {history.length} auction{history.length !== 1 ? 's' : ''} 
                  {pagination.totalPages > 1 && ` (Page ${pagination.currentPage} of ${pagination.totalPages})`}
                </small>
              </div>
              <div className="col-md-4 text-end">
                {summary && (
                  <small className="text-muted">
                    Win Rate: {summary.auctions_completed > 0 ? 
                      Math.round((summary.auctions_won / summary.auctions_completed) * 100) : 0}%
                  </small>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AuctionHistory;