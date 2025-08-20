
import React, { useState, useEffect } from "react";
import {
  getAuctionDetails,
  approveAuction,
  rejectAuction,
} from "../../services/auctionService";
import BidRecordsModal from "./BidRecordsModal";
import "../../styles/AuctionDetailsModal.css";

const AuctionDetailsModal = ({ auction, onClose, currentUser }) => {
  // State management
  const [auctionDetails, setAuctionDetails] = useState(null);
  const [topBidders, setTopBidders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("details");
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  
  // States for award/disqualify functionality
  const [showDisqualifyModal, setShowDisqualifyModal] = useState(false);
  const [disqualifyReason, setDisqualifyReason] = useState("");
  const [selectedBidder, setSelectedBidder] = useState(null);
  const [awardActionLoading, setAwardActionLoading] = useState({});
  
  // State for bid records modal
  const [showBidRecordsModal, setShowBidRecordsModal] = useState(false);

  // Fetch detailed auction information on component mount
  useEffect(() => {
    if (auction) {
      fetchAuctionDetails();
      fetchTopBidders();
    }
  }, [auction]);

  /**
   * Check if current user is system admin
   */
  const isSystemAdmin = () => {
    console.log('Current User Role:', currentUser?.role);
    return currentUser?.role === 'system_admin' || currentUser?.role === 'sys_admin';
  };

  /**
   * Check if auction can be approved/rejected
   */
  const canTakeAction = (auction) => {
    const status = auction?.calculated_status || auction?.status;
    console.log('Auction Status:', status);
    console.log('Is System Admin:', isSystemAdmin());
    return status?.toLowerCase() === 'pending' && isSystemAdmin();
  };

  /**
   * Fetch top 5 bidders for the auction
   */
  const fetchTopBidders = async () => {
    try {
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      console.log("Fetching top bidders for:", identifier);

      const response = await fetch(`http://localhost:5000/api/auction/${identifier}/top-bidders`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Top bidders response:', result);
      
      if (result.success) {
        setTopBidders(result.topBidders || []);
        console.log('Top bidders set:', result.topBidders);
      } else {
        console.error('Failed to fetch top bidders:', result.error);
        setTopBidders([]);
      }
    } catch (err) {
      console.error('Fetch top bidders error:', err);
      setTopBidders([]);
      // Don't set main error state for this as it might be expected (no bidders yet)
    }
  };

  /**
   * Handle awarding a bidder
   */
  const handleAwardBidder = async (bidderId, bidderName) => {
    if (!window.confirm(`Are you sure you want to award this auction to ${bidderName}?`)) {
      return;
    }

    try {
      setAwardActionLoading(prev => ({ ...prev, [bidderId]: true }));
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      
      // Extract bidder user ID from the bidder object
      const bidder = topBidders.find(b => b.bidder_id === bidderId);
      const bidderUserId = bidder?.bidder_user_id || bidderId;
      
      console.log('Awarding bidder:', bidderUserId, 'for auction:', identifier);
      
      const response = await fetch(`http://localhost:5000/api/auction/${identifier}/award/${bidderUserId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Award response:', result);
      
      if (result.success) {
        alert(`${bidderName} has been awarded the auction successfully!`);
        // Refresh top bidders to show updated statuses
        await fetchTopBidders();
      } else {
        throw new Error(result.error || "Failed to award bidder");
      }
    } catch (err) {
      console.error("Award bidder error:", err);
      alert(`Failed to award bidder: ${err.message}`);
    } finally {
      setAwardActionLoading(prev => ({ ...prev, [bidderId]: false }));
    }
  };

  /**
   * Handle disqualifying a bidder
   */
  const handleDisqualifyBidder = async () => {
    if (!disqualifyReason.trim()) {
      alert("Please provide a reason for disqualification.");
      return;
    }

    if (!selectedBidder) return;

    try {
      setActionLoading(true);
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      
      // Extract bidder user ID from the selected bidder
      const bidderUserId = selectedBidder.bidder_user_id || selectedBidder.bidder_id;
      
      console.log('Disqualifying bidder:', bidderUserId, 'for auction:', identifier, 'Reason:', disqualifyReason);
      
      const response = await fetch(`http://localhost:5000/api/auction/${identifier}/disqualify/${bidderUserId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: disqualifyReason }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Disqualify response:', result);
      
      if (result.success) {
        alert(`${selectedBidder.bidder_name} has been disqualified successfully!`);
        setShowDisqualifyModal(false);
        setDisqualifyReason("");
        setSelectedBidder(null);
        // Refresh top bidders to show updated statuses
        await fetchTopBidders();
      } else {
        throw new Error(result.error || "Failed to disqualify bidder");
      }
    } catch (err) {
      console.error("Disqualify bidder error:", err);
      alert(`Failed to disqualify bidder: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Open disqualify modal
   */
  const openDisqualifyModal = (bidder) => {
    setSelectedBidder(bidder);
    setShowDisqualifyModal(true);
  };

  /**
   * Close disqualify modal
   */
  const closeDisqualifyModal = () => {
    setShowDisqualifyModal(false);
    setDisqualifyReason("");
    setSelectedBidder(null);
  };

  /**
   * Fetch detailed auction information including invited bidders
   */
  const fetchAuctionDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use the correct ID field - prefer auction_id if available
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      console.log("Fetching details for:", identifier);

      const detailsResponse = await getAuctionDetails(identifier);

      let details = null;

      // Handle details response
      if (detailsResponse?.success) {
        details = {
          ...detailsResponse.auction,
          // Ensure backward compatibility
          InvitedBidders:
            detailsResponse.auction.auction_bidders
              ?.map((b) => b.name)
              .join(", ") || "No bidders invited",
        };
      } else {
        throw new Error(detailsResponse?.error || "Invalid auction data");
      }

      console.log("Fetched details:", details);
      setAuctionDetails(details);
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err.message || "Failed to load auction details");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle auction approval
   */
  const handleApproveAuction = async () => {
    if (!window.confirm("Are you sure you want to approve this auction?")) {
      return;
    }

    try {
      setActionLoading(true);
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      
      console.log('Approving auction with ID:', identifier);
      const response = await approveAuction(identifier);
      
      if (response.success) {
        alert("Auction approved successfully!");
        await fetchAuctionDetails(); // Refresh the data
        // Optionally close modal or refresh parent component
        if (onClose) onClose(true); // Pass true to indicate refresh needed
      } else {
        throw new Error(response.error || "Failed to approve auction");
      }
    } catch (err) {
      console.error("Approve error:", err);
      alert(`Failed to approve auction: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Handle auction rejection
   */
  const handleRejectAuction = async () => {
    if (!rejectionReason.trim()) {
      alert("Please provide a reason for rejection.");
      return;
    }

    try {
      setActionLoading(true);
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      
      console.log('Rejecting auction with ID:', identifier, 'Reason:', rejectionReason);
      const response = await rejectAuction(identifier, rejectionReason);
      
      if (response.success) {
        alert("Auction rejected successfully!");
        setShowRejectModal(false);
        setRejectionReason("");
        await fetchAuctionDetails(); // Refresh the data
        // Optionally close modal or refresh parent component
        if (onClose) onClose(true); // Pass true to indicate refresh needed
      } else {
        throw new Error(response.error || "Failed to reject auction");
      }
    } catch (err) {
      console.error("Reject error:", err);
      alert(`Failed to reject auction: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Get status badge class for styling
   */
  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case "pending":
        return "status-badge status-pending";
      case "approved":
        return "status-badge status-approved";
      case "rejected":
        return "status-badge status-rejected";
      case "live":
        return "status-badge status-live";
      case "ended":
        return "status-badge status-ended";
      case "cancelled":
        return "status-badge status-cancelled";
      case "awarded":
        return "status-badge status-awarded";
      case "not_awarded":
        return "status-badge status-not-awarded";
      case "disqualified":
        return "status-badge status-disqualified";
      default:
        return "status-badge status-default";
    }
  };

  /**
   * Format currency for display
   */
  const formatCurrency = (amount) => {
    if (!amount) return "No bids";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  /**
   * Handle modal backdrop click
   */
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  /**
   * Handle opening bid records modal
   */
  const handleViewBidRecords = () => {
    setShowBidRecordsModal(true);
  };

  /**
   * Handle closing bid records modal
   */
  const handleCloseBidRecords = () => {
    setShowBidRecordsModal(false);
  };

  if (loading) {
    return (
      <div className="modal-backdrop" onClick={handleBackdropClick}>
        <div className="modal-content loading">
          <div className="loading-spinner"></div>
          <p>Loading auction details...</p>
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
            <button className="close-button" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="error-content">
            <p>{error}</p>
            <button className="btn btn-retry" onClick={fetchAuctionDetails}>
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Use auction details if available, otherwise fall back to original auction data
  const displayAuction = auctionDetails || auction;
  const currentStatus = (displayAuction.calculated_status || displayAuction.status)?.toLowerCase();

  return (
    <>
      <div className="modal-backdrop" onClick={handleBackdropClick}>
        <div className="modal-content auction-details-modal">
          {/* Modal Header */}
          <div className="modal-header">
            <div className="header-content">
              <h2>Auction Details</h2>
              {isSystemAdmin() && (
                <span className="admin-badge">System Administrator</span>
              )}
            </div>
            <button className="close-button" onClick={onClose}>
              ×
            </button>
          </div>

          {/* System Admin Action Banner for Pending Auctions */}
          {isSystemAdmin() && currentStatus === 'pending' && (
            <div className="admin-action-banner">
              <div className="banner-content">
                <div className="banner-icon">⚠️</div>
                <div className="banner-text">
                  <strong>Action Required:</strong> This auction is pending your approval.
                </div>
              </div>
              <div className="banner-actions">
                <button
                  className="btn btn-approve btn-small"
                  onClick={handleApproveAuction}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Processing...' : '✅ Approve'}
                </button>
                <button
                  className="btn btn-reject btn-small"
                  onClick={() => setShowRejectModal(true)}
                  disabled={actionLoading}
                >
                  ❌ Reject
                </button>
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="tab-navigation">
            <button
              className={`tab-button ${activeTab === "details" ? "active" : ""}`}
              onClick={() => setActiveTab("details")}
            >
              Basic Details
            </button>
            <button
              className={`tab-button ${activeTab === "bidders" ? "active" : ""}`}
              onClick={() => setActiveTab("bidders")}
            >
              Invited Bidders
            </button>
            <button
              className={`tab-button ${activeTab === "topbidders" ? "active" : ""}`}
              onClick={() => setActiveTab("topbidders")}
            >
              Top 5 Bidders
            </button>
          </div>

          {/* Modal Body */}
          <div className="modal-body">
            {/* Basic Details Tab */}
            {activeTab === "details" && (
              <div className="details-section">
                <div className="details-grid">
                  <div className="detail-item">
                    <label>Auction ID:</label>
                    <span className="auction-id-display">
                      {displayAuction.auction_id || displayAuction.AuctionID}
                    </span>
                  </div>

                  <div className="detail-item">
                    <label>Title:</label>
                    <span>{displayAuction.title || displayAuction.Title}</span>
                  </div>

                  <div className="detail-item">
                    <label>Category:</label>
                    <span>{displayAuction.category || displayAuction.Category}</span>
                  </div>

                  <div className="detail-item">
                    <label>SBU:</label>
                    <span className="sbu-badge">{displayAuction.sbu || displayAuction.SBU}</span>
                  </div>

                  <div className="detail-item">
                    <label>Status:</label>
                    <span className={getStatusBadgeClass(currentStatus)}>
                      {(currentStatus || "Unknown").toUpperCase()}
                    </span>
                  </div>

                  <div className="detail-item">
                    <label>Date & Time:</label>
                    <span>
                      {auction.auction_date
                        ? new Date(auction.auction_date).toLocaleDateString("en-US", {
                           year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : ""}
                    </span>
                  </div>

                  <div className="detail-item">
                    <label>Duration:</label>
                    <span>
                      {displayAuction.duration ||
                        displayAuction.duration_minutes ||
                        displayAuction.Duration ||
                        0}{" "}
                      minutes
                    </span>
                  </div>

                  <div className="detail-item">
                    <label>Created By:</label>
                    <span>{displayAuction.created_by}</span>
                  </div>

                  <div className="detail-item">
                    <label>Created At:</label>
                    <span>
                      {displayAuction.created_at
                        ? new Date(displayAuction.created_at).toLocaleString(
                            "en-GB"
                          )
                        : "Not available"}
                    </span>
                  </div>

                  {displayAuction.special_notices && (
                    <div className="detail-item full-width">
                      <label>Special Notices:</label>
                      <div className="special-notices">
                        {displayAuction.special_notices}
                      </div>
                    </div>
                  )}
                </div>

               
              </div>
            )}

            {/* Invited Bidders Tab */}
            {activeTab === "bidders" && (
              <div className="bidders-section">
                <div className="section-header">
                  <h3>Invited Bidders</h3>
                  <div className="section-actions">
                    <span className="bidders-count">
                      {displayAuction.auction_bidders?.length ||
                        displayAuction.InvitedBidders?.split(", ").length ||
                        0}{" "}
                      bidders invited
                    </span>
                    
                  </div>
                </div>

                <div className="bidders-table-container">
                  <table className="bidders-table">
                    <thead>
                      <tr>
                        <th>Bidder Name</th>
                        <th>Company</th>
                        <th>Invitation Status</th>
                        <th>Participation Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayAuction.auction_bidders?.length > 0 ? (
                        displayAuction.auction_bidders.map((bidder, index) => (
                          <tr key={bidder.bidder_id || index}>
                            <td className="bidder-name">{bidder.name}</td>
                            <td className="bidder-company">
                              {bidder.company || "Not specified"}
                            </td>
                            <td>
                              <span className="status-badge status-invited">
                                INVITED
                              </span>
                            </td>
                            <td>
                              <span
                                className={`status-badge ${
                                  topBidders.some(
                                    (r) => r.bidder_id === bidder.bidder_id
                                  )
                                    ? "status-participated"
                                    : "status-pending"
                                }`}
                              >
                                {topBidders.some(
                                  (r) => r.bidder_id === bidder.bidder_id
                                )
                                  ? "PARTICIPATED"
                                  : "PENDING"}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="no-data">
                            No bidders invited
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Top 5 Bidders Tab */}
            {activeTab === "topbidders" && (
              <div className="top-bidders-section">
                <div className="section-header">
                  <h3>🏆 Top 5 Bidders</h3>
                   <div className="details-actions">
                  <button
                    className="btn btn-bid-records"
                    onClick={handleViewBidRecords}
                  >
                    📋 View All Bid Records
                  </button>
                </div>
                  <div className="section-actions">
                    <span className="participation-count">
                      {topBidders.length} top bidders
                    </span>
                    <button
                      className="btn btn-refresh btn-small"
                      onClick={fetchTopBidders}
                    >
                      🔄 Refresh
                    </button>
                  </div>
                </div>

                {topBidders.length > 0 ? (
                  <div className="top-bidders-container">
                    <div className="top-bidders-explanation">
                      
                    </div>

                    <div className="top-bidders-table-container">
                      <table className="top-bidders-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                           
                            <th>Bidder Name</th>
                            <th>Company</th>
                            <th>Latest Bid Amount</th>
                            <th>Status</th>
                            {isSystemAdmin() && <th>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {topBidders.map((bidder, index) => (
                            <tr
                              key={bidder.bidder_id}
                              className={`bidder-row ${
                                bidder.result_status === 'awarded' ? 'awarded-row' : 
                                bidder.result_status === 'disqualified' ? 'disqualified-row' : 
                                bidder.result_status === 'not_awarded' ? 'not-awarded-row' : ''
                              }`}
                            >
                              <td className="rank-cell">
                                <span className={`rank-badge ${index === 0 ? "rank-winner" : ""}`}>
                                  {index === 0 ? "🥇" : `#${index + 1}`}
                                </span>
                              </td>
                              
                              <td className="bidder-name">{bidder.bidder_name}</td>
                              <td className="bidder-company">
                                {bidder.company_name || "Not specified"}
                              </td>
                              <td className="bid-amount">
                                <span className={index === 0 ? "winning-amount" : "regular-amount"}>
                                  {formatCurrency(bidder.latest_bid_amount)}
                                </span>
                              </td>
                              <td>
                                <span className={getStatusBadgeClass(bidder.result_status || 'pending')}>
                                  {bidder.result_status ? 
                                    bidder.result_status.toUpperCase().replace('_', ' ') : 
                                    'PENDING'
                                  }
                                </span>
                              </td>
                              {isSystemAdmin() && (
                                <td className="actions-cell">
                                  {!bidder.result_status || bidder.result_status === 'pending' ? (
                                    <div className="action-buttons">
                                      <button
                                        className="btn btn-award btn-small"
                                        onClick={() => handleAwardBidder(bidder.bidder_id, bidder.bidder_name)}
                                        disabled={awardActionLoading[bidder.bidder_id]}
                                        title="Award this bidder"
                                      >
                                        {awardActionLoading[bidder.bidder_id] ? '⏳' : '🏆'} Award
                                      </button>
                                      <button
                                        className="btn btn-disqualify btn-small"
                                        onClick={() => openDisqualifyModal(bidder)}
                                        disabled={awardActionLoading[bidder.bidder_id]}
                                        title="Disqualify this bidder"
                                      >
                                        ❌ Disqualify
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="action-status">
                                      {bidder.result_status === 'awarded' && (
                                        <span className="status-text awarded-text">✅ Awarded</span>
                                      )}
                                      {bidder.result_status === 'not_awarded' && (
                                        <span className="status-text not-awarded-text">➖ Not Awarded</span>
                                      )}
                                      {bidder.result_status === 'disqualified' && (
                                        <span className="status-text disqualified-text">
                                          🚫 Disqualified
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    
                        
                       
                        
                  </div>
                ) : (
                  <div className="no-top-bidders-data">
                    <div className="no-data-icon">📊</div>
                    <h4>No Top Bidders Data Available</h4>
                    <p>
                      {currentStatus === "pending"
                        ? "Auction has not been approved yet"
                        : currentStatus === "approved"
                        ? "Auction has not started yet or no bids have been placed"
                        : currentStatus === "live"
                        ? "Auction is currently live - refresh to see latest bids"
                        : "No bids were placed in this auction"}
                    </p>
                    {currentStatus === "live" && (
                      <button
                        className="btn btn-refresh"
                        onClick={fetchTopBidders}
                      >
                        Refresh Data
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>


          {/* Modal Footer */}
          <div className="modal-footer">
            <div className="footer-info">
              <small>Last updated: {new Date().toLocaleString("en-GB")}</small>
            </div>
            <div className="footer-actions">
              {/* Show approval/rejection buttons only for system admins and pending auctions */}
              {canTakeAction(displayAuction) && (
                <>
                  <button
                    className="btn btn-approve"
                    onClick={handleApproveAuction}
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Processing...' : '✅ Approve Auction'}
                  </button>
                  <button
                    className="btn btn-reject"
                    onClick={() => setShowRejectModal(true)}
                    disabled={actionLoading}
                  >
                    ❌ Reject Auction
                  </button>
                </>
              )}
              <button className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="modal-backdrop" style={{ zIndex: 1001 }}>
          <div className="modal-content reject-modal">
            <div className="modal-header">
              <h3>Reject Auction</h3>
              <button 
                className="close-button" 
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason("");
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="rejection-form">
                <p><strong>Auction ID:</strong> {displayAuction.auction_id || displayAuction.AuctionID}</p>
                <p><strong>Title:</strong> {displayAuction.title || displayAuction.Title}</p>
                <hr />
                <label htmlFor="rejectionReason">
                  <strong>Reason for Rejection:</strong> <span className="required">*</span>
                </label>
                <textarea
                  id="rejectionReason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Please provide a detailed reason for rejecting this auction..."
                  rows="4"
                  className="rejection-textarea"
                  required
                />
                <small className="help-text">
                  This reason will be visible to bidders.
                </small>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason("");
                }}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button 
                className="btn btn-reject" 
                onClick={handleRejectAuction}
                disabled={actionLoading || !rejectionReason.trim()}
              >
                {actionLoading ? 'Rejecting...' : '❌ Reject Auction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disqualify Modal */}
      {showDisqualifyModal && selectedBidder && (
        <div className="modal-backdrop" style={{ zIndex: 1001 }}>
          <div className="modal-content disqualify-modal">
            <div className="modal-header">
              <h3>Disqualify Bidder</h3>
              <button 
                className="close-button" 
                onClick={closeDisqualifyModal}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="disqualify-form">
                <div className="bidder-info">
                  
                  <p><strong>Bidder Name:</strong> {selectedBidder.bidder_name}</p>
                  <p><strong>Company:</strong> {selectedBidder.company_name || "Not specified"}</p>
                  <p><strong>Latest Bid:</strong> {formatCurrency(selectedBidder.latest_bid_amount)}</p>
                </div>
                <hr />
                <label htmlFor="disqualifyReason">
                  <strong>Reason for Disqualification:</strong> <span className="required">*</span>
                </label>
                <textarea
                  id="disqualifyReason"
                  value={disqualifyReason}
                  onChange={(e) => setDisqualifyReason(e.target.value)}
                  placeholder="Please provide a detailed reason for disqualifying this bidder..."
                  rows="4"
                  className="disqualify-textarea"
                  required
                />
                <small className="help-text">
                  This reason will be recorded and visible to administrators.
                </small>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={closeDisqualifyModal}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button 
                className="btn btn-disqualify" 
                onClick={handleDisqualifyBidder}
                disabled={actionLoading || !disqualifyReason.trim()}
              >
                {actionLoading ? 'Disqualifying...' : '🚫 Disqualify Bidder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bid Records Modal */}
      {showBidRecordsModal && (
        <BidRecordsModal
          auction={displayAuction}
          onClose={handleCloseBidRecords}
        />
      )}
    </>
  );
};

export default AuctionDetailsModal;