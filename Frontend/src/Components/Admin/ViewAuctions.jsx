import React, { useState, useEffect } from 'react';
import { getAllAuctions, getAuctionDetails, deleteAuction } from '../../services/auctionService';
import AuctionDetailsModal from './AuctionDetailsModal';
import EditAuctionModal from './EditAuctionModal';
import '../../styles/viewAuctions.css';

const ViewAuctions = () => {
  // State management
  const [auctions, setAuctions] = useState([]);
  const [filteredAuctions, setFilteredAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modal states
  const [selectedAuction, setSelectedAuction] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Filter states
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    sbu: '',
    category: '',
    dateFrom: '',
    dateTo: ''
  });
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Fetch auctions on component mount
  useEffect(() => {
    fetchAuctions();
  }, []);

  // Apply filters whenever filters or auctions change
  useEffect(() => {
    applyFilters();
  }, [filters, auctions]);

  /**
   * Fetch all auctions from the API
   */
  const fetchAuctions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getAllAuctions();
      
      if (response.success) {
        setAuctions(response.auctions || []);
      } else {
        setError(response.error || 'Failed to fetch auctions');
      }
    } catch (err) {
      console.error('Error fetching auctions:', err);
      setError('Failed to fetch auctions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Apply search and filter logic
   */
  const applyFilters = () => {
    let filtered = [...auctions];

    // Search filter (search in auction ID, title, category, SBU)
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(auction =>
        auction.AuctionID?.toLowerCase().includes(searchTerm) ||
        auction.Title?.toLowerCase().includes(searchTerm) ||
        auction.category?.toLowerCase().includes(searchTerm) ||
        auction.sbu?.toLowerCase().includes(searchTerm)
      );
    }

    // Status filter
    if (filters.status) {
      filtered = filtered.filter(auction => 
        auction.calculated_status === filters.status
      );
    }

    // SBU filter
    if (filters.sbu) {
      filtered = filtered.filter(auction => 
        auction.sbu === filters.sbu
      );
    }

    // Category filter
    if (filters.category) {
      filtered = filtered.filter(auction => 
        auction.category?.toLowerCase().includes(filters.category.toLowerCase())
      );
    }

    // Date range filter
    if (filters.dateFrom) {
      filtered = filtered.filter(auction => {
        const auctionDate = new Date(auction.auction_date);
        const fromDate = new Date(filters.dateFrom);
        return auctionDate >= fromDate;
      });
    }

    if (filters.dateTo) {
      filtered = filtered.filter(auction => {
        const auctionDate = new Date(auction.auction_date);
        const toDate = new Date(filters.dateTo);
        return auctionDate <= toDate;
      });
    }

    setFilteredAuctions(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  };

  /**
   * Handle filter changes
   */
  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  /**
   * Clear all filters
   */
  const clearFilters = () => {
    setFilters({
      search: '',
      status: '',
      sbu: '',
      category: '',
      dateFrom: '',
      dateTo: ''
    });
  };

  /**
   * Handle view auction details
   */
  const handleViewAuction = async (auction) => {
    try {
      setSelectedAuction(auction);
      setShowDetailsModal(true);
    } catch (err) {
      console.error('Error opening auction details:', err);
      setError('Failed to load auction details');
    }
  };

  /**
   * Handle edit auction
   */
  const handleEditAuction = (auction) => {
    setSelectedAuction(auction);
    setShowEditModal(true);
  };

  /**
   * Handle delete auction with confirmation
   */
  const handleDeleteAuction = async (auction) => {
    if (window.confirm(`Are you sure you want to delete auction "${auction.Title}"? This action cannot be undone.`)) {
      try {
        await deleteAuction(auction.id);
        await fetchAuctions(); // Refresh the list
        alert('Auction deleted successfully');
      } catch (err) {
        console.error('Error deleting auction:', err);
        alert('Failed to delete auction. Please try again.');
      }
    }
  };

  /**
   * Get status badge class for styling
   */
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'pending': return 'status-badge status-pending';
      case 'live': return 'status-badge status-live';
      case 'ended': return 'status-badge status-ended';
      case 'cancelled': return 'status-badge status-cancelled';
      default: return 'status-badge status-default';
    }
  };

  /**
   * Format date and time for display
   */
  const formatDateTime = (dateTimeString) => {
    const date = new Date(dateTimeString);
    return {
      date: date.toLocaleDateString('en-GB'),
      time: date.toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };
  };

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredAuctions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredAuctions.length / itemsPerPage);

  // Handle page change
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  return (
    <div className="view-auctions">
      <div className="view-auctions-header">
        <h2>View Auctions</h2>
        <button 
          className="btn btn-refresh"
          onClick={fetchAuctions}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Filter Section */}
      <div className="filters-section">
        <div className="filters-row">
          {/* Search Input */}
          <div className="filter-group">
            <label htmlFor="search">Search:</label>
            <input
              type="text"
              id="search"
              placeholder="Search by ID, Title, Category, SBU..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="filter-input"
            />
          </div>

          {/* Status Filter */}
          <div className="filter-group">
            <label htmlFor="status">Status:</label>
            <select
              id="status"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="filter-select"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="live">Live</option>
              <option value="ended">Ended</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* SBU Filter */}
          <div className="filter-group">
            <label htmlFor="sbu">SBU:</label>
            <select
              id="sbu"
              value={filters.sbu}
              onChange={(e) => handleFilterChange('sbu', e.target.value)}
              className="filter-select"
            >
              <option value="">All SBUs</option>
              <option value="SBU1">SBU1</option>
              <option value="SBU2">SBU2</option>
              <option value="SBU3">SBU3</option>
              <option value="SBU4">SBU4</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="filter-group">
            <label htmlFor="category">Category:</label>
            <input
              type="text"
              id="category"
              placeholder="Filter by category..."
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
              className="filter-input"
            />
          </div>
        </div>

        <div className="filters-row">
          {/* Date From Filter */}
          <div className="filter-group">
            <label htmlFor="dateFrom">Date From:</label>
            <input
              type="date"
              id="dateFrom"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="filter-input"
            />
          </div>

          {/* Date To Filter */}
          <div className="filter-group">
            <label htmlFor="dateTo">Date To:</label>
            <input
              type="date"
              id="dateTo"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="filter-input"
            />
          </div>

          {/* Clear Filters Button */}
          <div className="filter-group">
            <button 
              className="btn btn-clear"
              onClick={clearFilters}
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div className="results-summary">
        <p>
          Showing {currentItems.length} of {filteredAuctions.length} auctions
          {filters.search && ` (filtered from ${auctions.length} total)`}
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <p>Error: {error}</p>
          <button onClick={fetchAuctions} className="btn btn-retry">
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          <p>Loading auctions...</p>
        </div>
      )}

      {/* Auctions Table */}
      {!loading && !error && (
        <div className="auctions-table-container">
          <table className="auctions-table">
            <thead>
              <tr>
                <th>Auction ID</th>
                <th>Title</th>
                <th>Category</th>
                <th>SBU</th>
                <th>Date</th>
                <th>Time</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.length === 0 ? (
                <tr>
                  <td colSpan="9" className="no-data">
                    {filteredAuctions.length === 0 && auctions.length > 0
                      ? 'No auctions match your filters'
                      : 'No auctions found'
                    }
                  </td>
                </tr>
              ) : (
                currentItems.map((auction) => {
                  const dateTime = formatDateTime(auction.DateTime || `${auction.auction_date} ${auction.start_time}`);
                  
                  return (
                    <tr key={auction.AuctionID || auction.id}>
                      <td className="auction-id">{auction.AuctionID || auction.auction_id}</td>
                      <td className="auction-title">{auction.Title || auction.title}</td>
                      <td>{auction.category}</td>
                      <td>{auction.sbu}</td>
                      <td>{dateTime.date}</td>
                      <td>{dateTime.time}</td>
                      <td>{auction.Duration || `${auction.duration_minutes} min`}</td>
                      <td>
                        <span className={getStatusBadgeClass(auction.calculated_status || auction.status)}>
                          {(auction.calculated_status || auction.status || 'unknown').toUpperCase()}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <div className="actions-buttons">
                          <button
                            className="btn btn-view"
                            onClick={() => handleViewAuction(auction)}
                            title="View Details"
                          >
                            View
                          </button>
                          <button
                            className="btn btn-edit"
                            onClick={() => handleEditAuction(auction)}
                            title="Edit Auction"
                            disabled={auction.calculated_status === 'live' || auction.calculated_status === 'ended'}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-delete"
                            onClick={() => handleDeleteAuction(auction)}
                            title="Delete Auction"
                            disabled={auction.calculated_status === 'live'}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          
          <div className="pagination-numbers">
            {[...Array(totalPages)].map((_, index) => (
              <button
                key={index + 1}
                className={`pagination-btn ${currentPage === index + 1 ? 'active' : ''}`}
                onClick={() => handlePageChange(index + 1)}
              >
                {index + 1}
              </button>
            ))}
          </div>
          
          <button
            className="pagination-btn"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}

      {/* Modals */}
      {showDetailsModal && selectedAuction && (
        <AuctionDetailsModal
          auction={selectedAuction}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedAuction(null);
          }}
        />
      )}

      {showEditModal && selectedAuction && (
        <EditAuctionModal
          auction={selectedAuction}
          onClose={() => {
            setShowEditModal(false);
            setSelectedAuction(null);
          }}
          onSave={() => {
            setShowEditModal(false);
            setSelectedAuction(null);
            fetchAuctions(); // Refresh the list after edit
          }}
        />
      )}
    </div>
  );
};

export default ViewAuctions;