import React, { useState, useEffect } from "react";
import {
  getAuctionDetails,
  getAuctionRankings,
} from "../../services/auctionService";
import "../../styles/AuctionDetailsModal.css";

const AuctionDetailsModal = ({ auction, onClose }) => {
  // State management
  const [auctionDetails, setAuctionDetails] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("details");

  // Fetch detailed auction information on component mount
  useEffect(() => {
    if (auction) {
      fetchAuctionDetails();
    }
  }, [auction]);

  /**
   * Fetch detailed auction information including invited bidders and bidding data
   */
  const fetchAuctionDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use the correct ID field - prefer auction_id if available
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      console.log("Fetching details for:", identifier);

      const [detailsResponse, rankingsResponse] = await Promise.allSettled([
        getAuctionDetails(identifier),
        getAuctionRankings(identifier),
      ]);

      let details = null;
      let rankings = [];

      // Handle details response
      if (detailsResponse.status === "fulfilled") {
        if (detailsResponse.value?.success) {
          details = {
            ...detailsResponse.value.auction,
            // Ensure backward compatibility
            InvitedBidders:
              detailsResponse.value.auction.auction_bidders
                ?.map((b) => b.name)
                .join(", ") || "No bidders invited",
          };
        } else {
          throw new Error(
            detailsResponse.value?.error || "Invalid auction data"
          );
        }
      } else {
        throw detailsResponse.reason;
      }

      // Handle rankings response
      if (
        rankingsResponse.status === "fulfilled" &&
        rankingsResponse.value?.success
      ) {
        rankings = rankingsResponse.value.rankings || [];
      }

      console.log("Fetched details:", details);
      setAuctionDetails(details);
      setRankings(rankings);
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err.message || "Failed to load auction details");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Format date and time for display
   */
  const formatDateTime = (dateTimeString) => {
    if (!dateTimeString) return "Not available";

    try {
      // Handle both combined date_time and separate date/time
      const dateTime = new Date(dateTimeString);
      return dateTime.toLocaleString("en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch (e) {
      console.error("Date formatting error:", e);
      return dateTimeString; // Return the original string if parsing fails
    }
  };

  /**
   * Get status badge class for styling
   */
  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case "pending":
        return "status-badge status-pending";
      case "live":
        return "status-badge status-live";
      case "ended":
        return "status-badge status-ended";
      case "cancelled":
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

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content auction-details-modal">
        {/* Modal Header */}
        <div className="modal-header">
          <h2>Auction Details</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

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
            className={`tab-button ${activeTab === "rankings" ? "active" : ""}`}
            onClick={() => setActiveTab("rankings")}
          >
            Bidding Reports
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
                    {displayAuction.auction_id}
                  </span>
                </div>

                <div className="detail-item">
                  <label>Title:</label>
                  <span>{displayAuction.title}</span>
                </div>

                <div className="detail-item">
                  <label>Category:</label>
                  <span>{displayAuction.category}</span>
                </div>

                <div className="detail-item">
                  <label>SBU:</label>
                  <span className="sbu-badge">{displayAuction.sbu}</span>
                </div>

                <div className="detail-item">
                  <label>Status:</label>
                  <span
                    className={getStatusBadgeClass(
                      displayAuction.status || displayAuction.status
                    )}
                  >
                    {(
                      displayAuction.calculated_status ||
                      displayAuction.status ||
                      "Unknown"
                    ).toUpperCase()}
                  </span>
                </div>

                <div className="detail-item">
                  <label>Date & Time:</label>
                  <span>{formatDateTime(displayAuction.date_time)}</span>
                </div>

                <div className="detail-item">
                  <label>Duration:</label>
                  <span>
                    {displayAuction.duration ||
                      displayAuction.duration_minutes ||
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
                <span className="bidders-count">
                  {displayAuction.auction_bidders?.length ||
                    displayAuction.InvitedBidders?.split(", ").length ||
                    0}{" "}
                  bidders invited
                </span>
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
                  {/* In the bidders tab section */}
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
                                rankings.some(
                                  (r) => r.bidder_id === bidder.bidder_id
                                )
                                  ? "status-participated"
                                  : "status-pending"
                              }`}
                            >
                              {rankings.some(
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

          {/* Bidding Reports Tab */}
          {activeTab === "rankings" && (
            <div className="rankings-section">
              <div className="section-header">
                <h3>Bidding Reports & Rankings</h3>
                <span className="participation-count">
                  {rankings.length} bidders participated
                </span>
              </div>

              {rankings.length > 0 ? (
                <div className="rankings-container">
                  {/* Winner Highlight */}
                  {rankings.length > 0 && (
                    <div className="winner-highlight">
                      <h4>🏆 Winner</h4>
                      <div className="winner-info">
                        <div className="winner-details">
                          <span className="winner-name">
                            {rankings[0].name}
                          </span>
                          <span className="winner-company">
                            {rankings[0].company}
                          </span>
                        </div>
                        <div className="winner-bid">
                          <span className="winning-amount">
                            {formatCurrency(rankings[0].amount)}
                          </span>
                          <span className="bid-time">
                            Bid Time:{" "}
                            {new Date(rankings[0].bid_time).toLocaleString(
                              "en-GB"
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rankings Table */}
                  <div className="rankings-table-container">
                    <table className="rankings-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Bidder Name</th>
                          <th>Company</th>
                          <th>Best Bid Amount</th>
                          <th>Bid Time</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankings.map((bidder, index) => (
                          <tr
                            key={bidder.bidder_id}
                            className={index === 0 ? "winner-row" : ""}
                          >
                            <td className="rank-cell">
                              <span
                                className={`rank-badge ${
                                  index === 0 ? "rank-winner" : ""
                                }`}
                              >
                                {index === 0 ? "🥇" : `#${index + 1}`}
                              </span>
                            </td>
                            <td className="bidder-name">{bidder.name}</td>
                            <td className="bidder-company">
                              {bidder.company || "Not specified"}
                            </td>
                            <td className="bid-amount">
                              <span
                                className={
                                  index === 0
                                    ? "winning-amount"
                                    : "regular-amount"
                                }
                              >
                                {formatCurrency(bidder.amount)}
                              </span>
                            </td>
                            <td className="bid-time">
                              {new Date(bidder.bid_time).toLocaleString(
                                "en-GB"
                              )}
                            </td>
                            <td>
                              <span
                                className={`status-badge ${
                                  index === 0
                                    ? "status-winner"
                                    : "status-participated"
                                }`}
                              >
                                {index === 0 ? "WINNER" : "PARTICIPANT"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Bidding Statistics */}
                  <div className="bidding-statistics">
                    <h4>Bidding Statistics</h4>
                    <div className="stats-grid">
                      <div className="stat-item">
                        <label>Total Participants:</label>
                        <span>{rankings.length}</span>
                      </div>
                      <div className="stat-item">
                        <label>Winning Bid:</label>
                        <span className="winning-amount">
                          {rankings.length > 0
                            ? formatCurrency(rankings[0].amount)
                            : "No bids"}
                        </span>
                      </div>
                      <div className="stat-item">
                        <label>Highest Bid:</label>
                        <span>
                          {rankings.length > 0
                            ? formatCurrency(
                                Math.max(...rankings.map((r) => r.amount))
                              )
                            : "No bids"}
                        </span>
                      </div>
                      <div className="stat-item">
                        <label>Average Bid:</label>
                        <span>
                          {rankings.length > 0
                            ? formatCurrency(
                                rankings.reduce((sum, r) => sum + r.amount, 0) /
                                  rankings.length
                              )
                            : "No bids"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="no-bidding-data">
                  <div className="no-data-icon">📊</div>
                  <h4>No Bidding Data Available</h4>
                  <p>
                    {(displayAuction.calculated_status ||
                      displayAuction.status) === "pending"
                      ? "Auction has not started yet"
                      : (displayAuction.calculated_status ||
                          displayAuction.status) === "live"
                      ? "Auction is currently live - refresh to see latest bids"
                      : "No bids were placed in this auction"}
                  </p>
                  {(displayAuction.calculated_status ||
                    displayAuction.status) === "live" && (
                    <button
                      className="btn btn-refresh"
                      onClick={fetchAuctionDetails}
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
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuctionDetailsModal;
