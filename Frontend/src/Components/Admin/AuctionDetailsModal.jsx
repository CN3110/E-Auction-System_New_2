import React, { useState, useEffect } from "react";
import {
  getAuctionDetails,
  approveAuction,
  rejectAuction,
} from "../../services/auctionService";
import BidRecordsModal from "./BidRecordsModal";
import "../../styles/AuctionDetailsModal.css";

const API_URL = 'http://localhost:5000/api';
//const API_URL = 'https://procubid.anunine.com/api'

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
  
  // States for new functionality
  const [showDisqualifyModal, setShowDisqualifyModal] = useState(false);
  const [showCancelModal, setCancelModal] = useState(false);
  const [disqualifyReason, setDisqualifyReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [selectedBidder, setSelectedBidder] = useState(null);
  const [awardActionLoading, setAwardActionLoading] = useState({});
  const [auctionStatus, setAuctionStatus] = useState('');
  
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
    return currentUser?.role === 'system_admin' || currentUser?.role === 'sys_admin';
  };

  /**
   * Check if auction can be approved/rejected
   */
  const canTakeAction = (auction) => {
    const status = auction?.calculated_status || auction?.status;
    return status?.toLowerCase() === 'pending' && isSystemAdmin();
  };

  /**
   * FIXED: Check if auction can be shortlisted - allow approved, live, and ended status
   */
  const canShortlist = () => {
    const validStatuses = ['approved', 'live', 'ended'];
    const hasValidStatus = validStatuses.includes(auctionStatus?.toLowerCase());
    const isAdmin = isSystemAdmin();
    const noShortlistedBidders = !topBidders.some(b => b.result_status === 'short-listed');
    
    console.log('Shortlist check:', {
      auctionStatus,
      hasValidStatus,
      isAdmin,
      noShortlistedBidders,
      topBidders: topBidders.length
    });
    
    return hasValidStatus && isAdmin && noShortlistedBidders && topBidders.length > 0;
  };

  /**
   * Check if auction can be cancelled
   */
  const canCancelAuction = () => {
    const nonCancellableStatuses = ['cancelled', 'ended'];
    const hasAwardedBidders = topBidders.some(b => ['awarded', 'not_awarded'].includes(b.result_status));
    
    return isSystemAdmin() && 
           !nonCancellableStatuses.includes(auctionStatus?.toLowerCase()) &&
           !hasAwardedBidders;
  };

  /**
   * Check if bidder can be awarded (only shortlisted bidders)
   */
  const canAwardBidder = (bidder) => {
    return isSystemAdmin() && bidder.result_status === 'short-listed';
  };

  /**
   * Check if bidder can be marked as not awarded (only shortlisted bidders)
   */
  const canMarkNotAwarded = (bidder) => {
    return isSystemAdmin() && bidder.result_status === 'short-listed';
  };

  /**
   * Check if bidder can be disqualified (shortlisted or pending bidders)
   */
  const canDisqualifyBidder = (bidder) => {
    return isSystemAdmin() && 
           ['short-listed', 'pending', null].includes(bidder.result_status);
  };

  /**
   * Fetch top 5 bidders for the auction
   */
  const fetchTopBidders = async () => {
    try {
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      console.log("Fetching top bidders for:", identifier);

      const response = await fetch(`${API_URL}/auction/${identifier}/top-bidders`, {
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
        setAuctionStatus(result.auctionStatus || '');
        console.log('Top bidders set:', result.topBidders);
        console.log('Auction status set:', result.auctionStatus);
      } else {
        console.error('Failed to fetch top bidders:', result.error);
        setTopBidders([]);
      }
    } catch (err) {
      console.error('Fetch top bidders error:', err);
      setTopBidders([]);
    }
  };

  /**
   * Handle shortlisting top 5 bidders
   */
  const handleShortlistBidders = async () => {
    if (!window.confirm('Are you sure you want to shortlist the top 5 bidders? This will send emails to shortlisted bidders and mark others as not shortlisted.')) {
      return;
    }

    try {
      setActionLoading(true);
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      
      const response = await fetch(`${API_URL}/auction/${identifier}/shortlist`, {
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
      
      if (result.success) {
        alert(`Successfully shortlisted ${result.data.shortlisted} bidders!`);
        await fetchTopBidders(); // Refresh the data
      } else {
        throw new Error(result.error || "Failed to shortlist bidders");
      }
    } catch (err) {
      console.error("Shortlist bidders error:", err);
      alert(`Failed to shortlist bidders: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Handle awarding a bidder
   */
  const handleAwardBidder = async (bidderId, bidderName) => {
    if (!window.confirm(`Are you sure you want to award this auction to ${bidderName}? This will automatically mark other shortlisted bidders as not awarded.`)) {
      return;
    }

    try {
      setAwardActionLoading(prev => ({ ...prev, [bidderId]: true }));
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      
      console.log('Awarding bidder:', bidderId, 'for auction:', identifier);
      
      const response = await fetch(`${API_URL}/auction/${identifier}/award/${bidderId}`, {
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
      
      if (result.success) {
        alert(`${bidderName} has been awarded the auction successfully!`);
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
   * Handle marking bidder as not awarded
   */
  const handleMarkNotAwarded = async (bidderId, bidderName) => {
    if (!window.confirm(`Are you sure you want to mark ${bidderName} as not awarded?`)) {
      return;
    }

    try {
      setAwardActionLoading(prev => ({ ...prev, [bidderId]: true }));
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      
      const response = await fetch(`${API_URL}/auction/${identifier}/not-award/${bidderId}`, {
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
      
      if (result.success) {
        alert(`${bidderName} has been marked as not awarded.`);
        await fetchTopBidders();
      } else {
        throw new Error(result.error || "Failed to mark as not awarded");
      }
    } catch (err) {
      console.error("Mark not awarded error:", err);
      alert(`Failed to mark as not awarded: ${err.message}`);
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
      
      const response = await fetch(`${API_URL}/auction/${identifier}/disqualify/${selectedBidder.bidder_id}`, {
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
      
      if (result.success) {
        alert(`${selectedBidder.bidder_name} has been disqualified successfully!`);
        setShowDisqualifyModal(false);
        setDisqualifyReason("");
        setSelectedBidder(null);
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
   * Handle cancelling auction
   */
  const handleCancelAuction = async () => {
    if (!cancelReason.trim()) {
      alert("Please provide a reason for cancellation.");
      return;
    }

    try {
      setActionLoading(true);
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      
      const response = await fetch(`${API_URL}/auction/${identifier}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: cancelReason }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        alert(`Auction has been cancelled successfully! bidders have been notified.`);
        setCancelModal(false);
        setCancelReason("");
        await fetchAuctionDetails();
        await fetchTopBidders();
      } else {
        throw new Error(result.error || "Failed to cancel auction");
      }
    } catch (err) {
      console.error("Cancel auction error:", err);
      alert(`Failed to cancel auction: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Open modals
   */
  const openDisqualifyModal = (bidder) => {
    setSelectedBidder(bidder);
    setShowDisqualifyModal(true);
  };

  const openCancelModal = () => {
    setCancelModal(true);
  };

  /**
   * Close modals
   */
  const closeDisqualifyModal = () => {
    setShowDisqualifyModal(false);
    setDisqualifyReason("");
    setSelectedBidder(null);
  };

  const closeCancelModal = () => {
    setCancelModal(false);
    setCancelReason("");
  };

  /**
   * Fetch detailed auction information including invited bidders
   */
  const fetchAuctionDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      console.log("Fetching details for:", identifier);

      const detailsResponse = await getAuctionDetails(identifier);

      let details = null;

      if (detailsResponse?.success) {
        details = {
          ...detailsResponse.auction,
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

  // [Previous approval/rejection handlers remain the same...]
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
        await fetchAuctionDetails();
        await fetchTopBidders(); // Refresh top bidders after approval
        if (onClose) onClose(true);
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
        await fetchAuctionDetails();
        if (onClose) onClose(true);
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
      case "short-listed":
        return "status-badge status-shortlisted";
      case "not-short-listed":
        return "status-badge status-not-shortlisted";
      case "awarded":
        return "status-badge status-awarded";
      case "not_awarded":
        return "status-badge status-not-awarded";
      case "disqualified":
        return "status-badge status-disqualified";
      case "cancel":
        return "status-badge status-cancelled";
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
              <div className="auction-status-indicator">
                <span className={getStatusBadgeClass(auctionStatus)}>
                  Current Status: {auctionStatus?.toUpperCase() || 'UNKNOWN'}
                </span>
              </div>
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

          {/* Shortlist Action Banner - UPDATED CONDITIONS */}
          {canShortlist() && (
            <div className="admin-action-banner shortlist-banner">
              <div className="banner-content">
                <div className="banner-icon">🎯</div>
                <div className="banner-text">
                  <strong>Ready for Shortlisting:</strong> Select top 5 bidders and send quotation requests.
                  <br />
                  <small>Status: {auctionStatus} | Bidders: {topBidders.length}</small>
                </div>
              </div>
              <div className="banner-actions">
                <button
                  className="btn btn-shortlist btn-small"
                  onClick={handleShortlistBidders}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Processing...' : '📋 Shortlist Top 5'}
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
              Top 5 Bidders ({topBidders.length})
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
                        ? new Date(displayAuction.created_at).toLocaleString("en-GB")
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
                                    : "status-not-participated"
                                }`}
                              >
                                {topBidders.some(
                                  (r) => r.bidder_id === bidder.bidder_id
                                )
                                  ? "PARTICIPATED"
                                  : "NOT PARTICIPATED"}
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

            {/* Top 5 Bidders Tab - UPDATED ACTIONS */}
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
                    {canCancelAuction() && (
                      <button
                        className="btn btn-cancel-auction"
                        onClick={openCancelModal}
                        disabled={actionLoading}
                      >
                        🚫 Cancel Auction
                      </button>
                    )}
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
                    <div className="top-bidders-table-container">
                      <table className="top-bidders-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Bidder Name</th>
                            <th>Company</th>
                            <th>Lowest Bid Amount</th>
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
                                bidder.result_status === 'not_awarded' ? 'not-awarded-row' :
                                bidder.result_status === 'short-listed' ? 'shortlisted-row' :
                                bidder.result_status === 'not-short-listed' ? 'not-shortlisted-row' : ''
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
                                  {formatCurrency(bidder.lowest_bid_amount || bidder.latest_bid_amount)}
                                </span>
                              </td>
                              <td>
                                <span className={getStatusBadgeClass(bidder.result_status || 'pending')}>
                                  {bidder.result_status ? 
                                    bidder.result_status.toUpperCase().replace('_', ' ').replace('-', ' ') : 
                                    'PENDING'
                                  }
                                </span>
                              </td>
                              {isSystemAdmin() && (
                                <td className="actions-cell">
                                  <div className="action-buttons">
                                    {/* AWARD BUTTON - Only for shortlisted bidders */}
                                    {canAwardBidder(bidder) && (
                                      <button
                                        className="btn btn-award btn-small"
                                        onClick={() => handleAwardBidder(bidder.bidder_id, bidder.bidder_name)}
                                        disabled={awardActionLoading[bidder.bidder_id]}
                                        title="Award this bidder"
                                      >
                                        {awardActionLoading[bidder.bidder_id] ? '⏳' : '🏆'} Award
                                      </button>
                                    )}

                                    {/* NOT AWARD BUTTON - Only for shortlisted bidders */}
                                    {canMarkNotAwarded(bidder) && (
                                      <button
                                        className="btn btn-not-award btn-small"
                                        onClick={() => handleMarkNotAwarded(bidder.bidder_id, bidder.bidder_name)}
                                        disabled={awardActionLoading[bidder.bidder_id]}
                                        title="Mark as not awarded"
                                      >
                                        {awardActionLoading[bidder.bidder_id] ? '⏳' : '➖'} Not Award
                                      </button>
                                    )}

                                    {/* DISQUALIFY BUTTON - For shortlisted or pending bidders */}
                                    {canDisqualifyBidder(bidder) && (
                                      <button
                                        className="btn btn-disqualify btn-small"
                                        onClick={() => openDisqualifyModal(bidder)}
                                        disabled={awardActionLoading[bidder.bidder_id]}
                                        title="Disqualify this bidder"
                                      >
                                        {awardActionLoading[bidder.bidder_id] ? '⏳' : '❌'} Disqualify
                                      </button>
                                    )}

                                    {/* STATUS INDICATORS - When no actions available */}
                                    {!canAwardBidder(bidder) && !canMarkNotAwarded(bidder) && !canDisqualifyBidder(bidder) && (
                                      <div className="action-status">
                                        {bidder.result_status === 'awarded' && (
                                          <span className="status-text awarded-text">✅ Awarded</span>
                                        )}
                                        {bidder.result_status === 'not_awarded' && (
                                          <span className="status-text not-awarded-text">➖ Not Awarded</span>
                                        )}
                                        {bidder.result_status === 'disqualified' && (
                                          <span className="status-text disqualified-text">🚫 Disqualified</span>
                                        )}
                                        {bidder.result_status === 'not-short-listed' && (
                                          <span className="status-text not-shortlisted-text">❌ Not Shortlisted</span>
                                        )}
                                        {bidder.result_status === 'cancel' && (
                                          <span className="status-text cancelled-text">🚫 Cancelled</span>
                                        )}
                                      </div>
                                    )}

                                    {/* AWAITING SHORTLIST - For pending bidders when shortlisting hasn't been done */}
                                    {(!bidder.result_status || bidder.result_status === 'pending') && 
                                     !canShortlist() && 
                                     !topBidders.some(b => b.result_status === 'short-listed') && (
                                      <div className="action-status">
                                        <span className="status-text pending-text">⏳ Awaiting Shortlist</span>
                                      </div>
                                    )}
                                  </div>
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
                        ? "Auction has been approved but no bids have been placed yet"
                        : currentStatus === "live"
                        ? "Auction is currently live - refresh to see latest bids"
                        : currentStatus === "ended"
                        ? "Auction has ended but no bids were placed"
                        : "No bids were placed in this auction"}
                    </p>
                    {(currentStatus === "live" || currentStatus === "approved") && (
                      <button
                        className="btn btn-refresh"
                        onClick={fetchTopBidders}
                      >
                        🔄 Refresh Data
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
              <small>
                Last updated: {new Date().toLocaleString("en-GB")} | 
                Status: {auctionStatus} | 
                Bidders: {topBidders.length}
              </small>
            </div>
            <div className="footer-actions">
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
              <button className="close-button" onClick={closeDisqualifyModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="disqualify-form">
                <div className="bidder-info">
                  <p><strong>Bidder Name:</strong> {selectedBidder.bidder_name}</p>
                  <p><strong>Company:</strong> {selectedBidder.company_name || "Not specified"}</p>
                  <p><strong>Latest Bid:</strong> {formatCurrency(selectedBidder.lowest_bid_amount || selectedBidder.latest_bid_amount)}</p>
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
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeDisqualifyModal} disabled={actionLoading}>
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

      {/* Cancel Auction Modal */}
      {showCancelModal && (
        <div className="modal-backdrop" style={{ zIndex: 1001 }}>
          <div className="modal-content cancel-modal">
            <div className="modal-header">
              <h3>Cancel Auction</h3>
              <button className="close-button" onClick={closeCancelModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="cancel-form">
                <div className="auction-info">
                  <p><strong>Auction ID:</strong> {displayAuction.auction_id || displayAuction.AuctionID}</p>
                  <p><strong>Title:</strong> {displayAuction.title || displayAuction.Title}</p>
                  <p><strong>Current Status:</strong> {auctionStatus}</p>
                </div>
                <div className="warning-notice">
                  <h4>⚠️ Warning</h4>
                  <p>Cancelling this auction will:</p>
                  <ul>
                    <li>Mark all bidders as cancelled</li>
                    <li>Send cancellation emails to all participants ({topBidders.length} bidders)</li>
                    <li>Make this auction permanently unavailable</li>
                  </ul>
                </div>
                <hr />
                <label htmlFor="cancelReason">
                  <strong>Reason for Cancellation:</strong> <span className="required">*</span>
                </label>
                <textarea
                  id="cancelReason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Please provide a detailed reason for cancelling this auction..."
                  rows="4"
                  className="cancel-textarea"
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeCancelModal} disabled={actionLoading}>
                Keep Auction
              </button>
              <button 
                className="btn btn-cancel-auction" 
                onClick={handleCancelAuction}
                disabled={actionLoading || !cancelReason.trim()}
              >
                {actionLoading ? 'Cancelling...' : '🚫 Cancel Auction'}
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