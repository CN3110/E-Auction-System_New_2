import React, { useState, useEffect } from 'react';
import "../../styles/BidRecordsModal.css";

const BidRecordsModal = ({ auction, onClose }) => {
  const [bidRecords, setBidRecords] = useState([]);
  const [filteredBids, setFilteredBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter states
  const [filters, setFilters] = useState({
    bidder: '',
    company: '',
    minAmount: '',
    maxAmount: '',
    dateRange: '',
    resultStatus: ''
  });

  // Sorting state
  const [sortConfig, setSortConfig] = useState({
    key: 'bid_time',
    direction: 'desc'
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage] = useState(10);

  useEffect(() => {
    if (auction) {
      fetchBidRecords();
    }
  }, [auction]);

  useEffect(() => {
    applyFilters();
  }, [bidRecords, filters, sortConfig]);

  /**
   * Fetch all bid records for the auction
   */
  const fetchBidRecords = async () => {
    try {
      setLoading(true);
      setError(null);

      const auctionId = auction.auction_id || auction.id || auction.AuctionID;
      console.log('Fetching bid records for auction:', auctionId);

      // Replace with your actual API endpoint
      const response = await fetch(`http://localhost:5000/api/auction/${auctionId}/all-bids`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      if (data.success) {
        setBidRecords(data.bids || []);
        console.log('Fetched bid records:', data.bids);
      } else {
        throw new Error(data.error || 'Failed to fetch bid records');
      }
    } catch (err) {
      console.error('Fetch bid records error:', err);
      setError(err.message || 'Failed to load bid records');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Apply filters and sorting to bid records
   */
  const applyFilters = () => {
    let filtered = [...bidRecords];

    // Apply filters
    if (filters.bidder) {
      filtered = filtered.filter(bid => 
        bid.bidder_name?.toLowerCase().includes(filters.bidder.toLowerCase())
      );
    }

    if (filters.company) {
      filtered = filtered.filter(bid => 
        bid.company_name?.toLowerCase().includes(filters.company.toLowerCase())
      );
    }

    if (filters.minAmount) {
      filtered = filtered.filter(bid => 
        parseFloat(bid.bid_amount) >= parseFloat(filters.minAmount)
      );
    }

    if (filters.maxAmount) {
      filtered = filtered.filter(bid => 
        parseFloat(bid.bid_amount) <= parseFloat(filters.maxAmount)
      );
    }

    if (filters.resultStatus) {
      filtered = filtered.filter(bid => 
        bid.result_status === filters.resultStatus
      );
    }

    if (filters.dateRange) {
      const now = new Date();
      let startDate = new Date();
      
      switch (filters.dateRange) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
        default:
          startDate = null;
      }

      if (startDate) {
        filtered = filtered.filter(bid => 
          new Date(bid.bid_time) >= startDate
        );
      }
    }

    // Apply sorting
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle numeric sorting for amounts
        if (sortConfig.key === 'bid_amount') {
          aValue = parseFloat(aValue) || 0;
          bValue = parseFloat(bValue) || 0;
        }

        // Handle date sorting
        if (sortConfig.key === 'bid_time') {
          aValue = new Date(aValue);
          bValue = new Date(bValue);
        }

        // Handle string sorting
        if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    setFilteredBids(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  };

  /**
   * Handle sorting
   */
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  /**
   * Handle filter changes
   */
  const handleFilterChange = (filterKey, value) => {
    setFilters(prev => ({
      ...prev,
      [filterKey]: value
    }));
  };

  /**
   * Clear all filters
   */
  const clearFilters = () => {
    setFilters({
      bidder: '',
      company: '',
      minAmount: '',
      maxAmount: '',
      dateRange: '',
      resultStatus: ''
    });
  };

  /**
   * Format currency
   */
  const formatCurrency = (amount) => {
    if (!amount) return "0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  /**
   * Get status badge class
   */
  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'awarded':
        return 'status-badge status-awarded';
      case 'not_awarded':
        return 'status-badge status-not-awarded';
      case 'pending':
        return 'status-badge status-pending';
      case 'disqualified':
        return 'status-badge status-disqualified';
      default:
        return 'status-badge status-default';
    }
  };

  /**
   * Get sort indicator
   */
  const getSortIndicator = (key) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    }
    return '';
  };

  /**
   * Handle modal backdrop click
   */
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Calculate pagination
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentRecords = filteredBids.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = Math.ceil(filteredBids.length / recordsPerPage);

  // Get unique values for filter dropdowns
  const uniqueBidders = [...new Set(bidRecords.map(bid => bid.bidder_name))].filter(Boolean);
  const uniqueCompanies = [...new Set(bidRecords.map(bid => bid.company_name))].filter(Boolean);
  const uniqueStatuses = [...new Set(bidRecords.map(bid => bid.result_status))].filter(Boolean);

  if (loading) {
    return (
      <div className="modal-backdrop" onClick={handleBackdropClick}>
        <div className="modal-content loading">
          <div className="loading-spinner"></div>
          <p>Loading bid records...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-backdrop" onClick={handleBackdropClick}>
        <div className="modal-content error">
          <div className="modal-header">
            <h2>Error</h2>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          <div className="error-content">
            <p>{error}</p>
            <button className="btn btn-retry" onClick={fetchBidRecords}>
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content bid-records-modal">
        {/* Modal Header */}
        <div className="modal-header">
          <div className="header-content">
            <h2>Bid Records</h2>
            <div className="auction-info">
              <span className="auction-id">
                {auction.auction_id || auction.AuctionID}
              </span>
              <span className="auction-title">
                {auction.title || auction.Title}
              </span>
            </div>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {/* Filters Section */}
        <div className="filters-section">
          <div className="filters-header">
            <h3>Filters</h3>
            <button className="btn btn-clear" onClick={clearFilters}>
              Clear All
            </button>
          </div>
          
          <div className="filters-grid">
            <div className="filter-group">
              <label>Bidder Name:</label>
              <select
                value={filters.bidder}
                onChange={(e) => handleFilterChange('bidder', e.target.value)}
              >
                <option value="">All Bidders</option>
                {uniqueBidders.map(bidder => (
                  <option key={bidder} value={bidder}>{bidder}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Company:</label>
              <select
                value={filters.company}
                onChange={(e) => handleFilterChange('company', e.target.value)}
              >
                <option value="">All Companies</option>
                {uniqueCompanies.map(company => (
                  <option key={company} value={company}>{company}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Min Amount:</label>
              <input
                type="number"
                placeholder="0.00"
                value={filters.minAmount}
                onChange={(e) => handleFilterChange('minAmount', e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>Max Amount:</label>
              <input
                type="number"
                placeholder="999999.99"
                value={filters.maxAmount}
                onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>Date Range:</label>
              <select
                value={filters.dateRange}
                onChange={(e) => handleFilterChange('dateRange', e.target.value)}
              >
                <option value="">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Result Status:</label>
              <select
                value={filters.resultStatus}
                onChange={(e) => handleFilterChange('resultStatus', e.target.value)}
              >
                <option value="">All Statuses</option>
                {uniqueStatuses.map(status => (
                  <option key={status} value={status}>
                    {status ? status.replace('_', ' ').toUpperCase() : 'N/A'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Records Summary */}
        <div className="records-summary">
          <div className="summary-stats">
            <div className="stat-item">
              <label>Total Records:</label>
              <span className="stat-value">{bidRecords.length}</span>
            </div>
            <div className="stat-item">
              <label>Filtered Records:</label>
              <span className="stat-value">{filteredBids.length}</span>
            </div>
            <div className="stat-item">
              <label>Showing:</label>
              <span className="stat-value">
                {indexOfFirstRecord + 1}-{Math.min(indexOfLastRecord, filteredBids.length)} of {filteredBids.length}
              </span>
            </div>
          </div>
          
          <div className="action-buttons">
            <button className="btn btn-refresh" onClick={fetchBidRecords}>
              🔄 Refresh
            </button>
            <button className="btn btn-export">
              📊 Export CSV
            </button>
          </div>
        </div>

        {/* Records Table */}
        <div className="table-container">
          {currentRecords.length > 0 ? (
            <table className="bid-records-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('bid_time')}>
                    Bid Time{getSortIndicator('bid_time')}
                  </th>
                  <th onClick={() => handleSort('bidder_name')}>
                    Bidder Name{getSortIndicator('bidder_name')}
                  </th>
                  <th onClick={() => handleSort('company_name')}>
                    Company{getSortIndicator('company_name')}
                  </th>
                  <th onClick={() => handleSort('bid_amount')}>
                    Amount{getSortIndicator('bid_amount')}
                  </th>
                  <th>Winning Status</th>
                  <th onClick={() => handleSort('result_status')}>
                    Result Status{getSortIndicator('result_status')}
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentRecords.map((bid, index) => (
                  <tr key={bid.bid_id || index} className={bid.is_winning ? 'winning-bid' : ''}>
                    <td className="bid-time">
                      {new Date(bid.bid_time).toLocaleString('en-GB', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td className="bidder-name">{bid.bidder_name || 'N/A'}</td>
                    <td className="company-name">{bid.company_name || 'Not specified'}</td>
                    <td className="bid-amount">
                      <span className={bid.is_winning ? 'winning-amount' : 'regular-amount'}>
                        {formatCurrency(bid.bid_amount)}
                      </span>
                    </td>
                    <td className="winning-status">
                      {bid.is_winning ? (
                        <span className="status-badge status-winning">🏆 WINNING</span>
                      ) : (
                        <span className="status-badge status-regular">-</span>
                      )}
                    </td>
                    <td className="result-status">
                      <span className={getStatusBadgeClass(bid.result_status)}>
                        {bid.result_status ? bid.result_status.replace('_', ' ').toUpperCase() : 'PENDING'}
                      </span>
                    </td>
                    <td className="actions">
                      <button 
                        className="btn btn-small btn-info"
                        title="View Details"
                      >
                        👁️
                      </button>
                      {bid.disqualification_reason && (
                        <button 
                          className="btn btn-small btn-warning"
                          title={`Disqualified: ${bid.disqualification_reason}`}
                        >
                          ⚠️
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="no-records">
              <div className="no-records-icon">📋</div>
              <h4>No Bid Records Found</h4>
              <p>
                {bidRecords.length === 0 
                  ? "No bids have been placed for this auction yet."
                  : "No records match your current filter criteria."
                }
              </p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="btn btn-pagination"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              First
            </button>
            <button
              className="btn btn-pagination"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            
            <div className="page-numbers">
              {[...Array(Math.min(5, totalPages))].map((_, index) => {
                let pageNumber;
                if (totalPages <= 5) {
                  pageNumber = index + 1;
                } else if (currentPage <= 3) {
                  pageNumber = index + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNumber = totalPages - 4 + index;
                } else {
                  pageNumber = currentPage - 2 + index;
                }
                
                return (
                  <button
                    key={pageNumber}
                    className={`btn btn-pagination ${currentPage === pageNumber ? 'active' : ''}`}
                    onClick={() => setCurrentPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                );
              })}
            </div>
            
            <button
              className="btn btn-pagination"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
            <button
              className="btn btn-pagination"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              Last
            </button>
          </div>
        )}

        {/* Modal Footer */}
        <div className="modal-footer">
          <div className="footer-info">
            <small>
              Last updated: {new Date().toLocaleString('en-GB')} | 
              Total bids: {bidRecords.length}
            </small>
          </div>
          <div className="footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BidRecordsModal;