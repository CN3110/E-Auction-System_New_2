import React, { useState, useEffect } from "react";
import {
  getAuctionDetails,
  approveAuction,
  rejectAuction,
  getTopBidders,
  awardBidder,
  disqualifyBidder,
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

  // Award / Disqualify states
  const [showDisqualifyModal, setShowDisqualifyModal] = useState(false);
  const [disqualifyReason, setDisqualifyReason] = useState("");
  const [selectedBidder, setSelectedBidder] = useState(null);
  const [awardActionLoading, setAwardActionLoading] = useState({});

  // Bid records modal
  const [showBidRecordsModal, setShowBidRecordsModal] = useState(false);

  /**
   * Check if current user is system admin
   */
  const isSystemAdmin = () =>
    currentUser?.role === "system_admin" || currentUser?.role === "sys_admin";

  /**
   * Fetch top bidders directly from backend
   */
  const fetchTopBidders = async () => {
    try {
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      console.log("Fetching top bidders for auction:", identifier);

      const response = await getTopBidders(identifier);

      if (response && response.success) {
        setTopBidders(response.topBidders || []);
        console.log("Top bidders fetched:", response.topBidders?.length || 0);
      } else {
        setTopBidders([]);
        console.warn("Failed to fetch top bidders:", response?.error);
      }
    } catch (err) {
      console.error("Error fetching top bidders:", err.message);
      setTopBidders([]);
    }
  };

  /**
   * Award a bidder
   */
  const handleAwardBidder = async (bidderId, bidderName) => {
    if (!window.confirm(`Award this auction to ${bidderName}?`)) return;

    try {
      setAwardActionLoading((prev) => ({ ...prev, [bidderId]: true }));
      const identifier = auction.auction_id || auction.id || auction.AuctionID;

      const bidder = topBidders.find((b) => b.bidder_id === bidderId);
      const bidderUserId = bidder?.bidder_user_id || bidderId;

      const response = await awardBidder(identifier, bidderUserId);

      if (response.success) {
        alert(`${bidderName} awarded successfully!`);
        await fetchTopBidders();
      } else {
        throw new Error(response.error || "Failed to award bidder");
      }
    } catch (err) {
      alert(`Error awarding bidder: ${err.message}`);
    } finally {
      setAwardActionLoading((prev) => ({ ...prev, [bidderId]: false }));
    }
  };

  /**
   * Disqualify bidder
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
      const bidderUserId =
        selectedBidder.bidder_user_id || selectedBidder.bidder_id;

      const response = await disqualifyBidder(
        identifier,
        bidderUserId,
        disqualifyReason
      );

      if (response.success) {
        alert(`${selectedBidder.bidder_name} disqualified successfully!`);
        setShowDisqualifyModal(false);
        setDisqualifyReason("");
        setSelectedBidder(null);
        await fetchTopBidders();
      } else {
        throw new Error(response.error || "Failed to disqualify bidder");
      }
    } catch (err) {
      alert(`Error disqualifying bidder: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Fetch auction details (always fetch top bidders too)
   */
  const fetchAuctionDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      const detailsResponse = await getAuctionDetails(identifier);

      if (detailsResponse?.success) {
        const details = {
          ...detailsResponse.auction,
          InvitedBidders:
            detailsResponse.auction.auction_bidders
              ?.map((b) => b.name)
              .join(", ") || "No bidders invited",
        };
        setAuctionDetails(details);
      } else {
        throw new Error(detailsResponse?.error || "Invalid auction data");
      }

      await fetchTopBidders();
    } catch (err) {
      setError(err.message || "Failed to load auction details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (auction) fetchAuctionDetails();
  }, [auction]);

  /**
   * Handle approval / rejection
   */
  const handleApproveAuction = async () => {
    if (!window.confirm("Approve this auction?")) return;

    try {
      setActionLoading(true);
      const identifier = auction.auction_id || auction.id || auction.AuctionID;
      const response = await approveAuction(identifier);

      if (response.success) {
        alert("Auction approved!");
        await fetchAuctionDetails();
        if (onClose) onClose(true);
      } else throw new Error(response.error || "Failed to approve");
    } catch (err) {
      alert(`Error approving: ${err.message}`);
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
      const response = await rejectAuction(identifier, rejectionReason);

      if (response.success) {
        alert("Auction rejected!");
        setShowRejectModal(false);
        setRejectionReason("");
        await fetchAuctionDetails();
        if (onClose) onClose(true);
      } else throw new Error(response.error || "Failed to reject");
    } catch (err) {
      alert(`Error rejecting: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Helpers
   */
  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case "pending":
        return "status-badge status-pending";
      case "approved":
        return "status-badge status-approved";
      case "rejected":
        return "status-badge status-rejected";
      case "awarded":
        return "status-badge status-awarded";
      case "disqualified":
        return "status-badge status-disqualified";
      default:
        return "status-badge status-default";
    }
  };

  const formatCurrency = (amount) =>
    !amount
      ? "No bids"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "LKR",
          minimumFractionDigits: 2,
        }).format(amount);

  if (loading) {
    return (
      <div className="modal-backdrop">
        <div className="modal-content loading">
          <div className="loading-spinner"></div>
          <p>Loading auction details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-backdrop">
        <div className="modal-content error">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={fetchAuctionDetails}>Retry</button>
        </div>
      </div>
    );
  }

  const displayAuction = auctionDetails || auction;

  return (
    <>
      <div className="modal-backdrop">
        <div className="modal-content auction-details-modal">
          {/* Header */}
          <div className="modal-header">
            <h2>Auction Details</h2>
            <button className="close-button" onClick={onClose}>
              ×
            </button>
          </div>

          {/* Tabs */}
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
              Auction Results
            </button>
          </div>

          <div className="modal-body">
            {/* Auction Results */}
            {activeTab === "rankings" && (
              <div className="rankings-section">
                {topBidders.length > 0 ? (
                  <table className="top-bidders-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Bidder</th>
                        <th>Company</th>
                        <th>Final Bid</th>
                        <th>Status</th>
                        {isSystemAdmin() && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {topBidders.map((b, i) => (
                        <tr key={b.bidder_id}>
                          <td>{i + 1}</td>
                          <td>{b.bidder_name}</td>
                          <td>{b.company_name}</td>
                          <td>{formatCurrency(b.latest_bid_amount)}</td>
                          <td>
                            <span className={getStatusBadgeClass(b.result_status)}>
                              {b.result_status?.toUpperCase() || "PENDING"}
                            </span>
                          </td>
                          {isSystemAdmin() && (
                            <td>
                              {!b.result_status || b.result_status === "pending" ? (
                                <>
                                  <button
                                    onClick={() =>
                                      handleAwardBidder(b.bidder_id, b.bidder_name)
                                    }
                                    disabled={awardActionLoading[b.bidder_id]}
                                  >
                                    🏆 Award
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedBidder(b);
                                      setShowDisqualifyModal(true);
                                    }}
                                  >
                                    ❌ Disqualify
                                  </button>
                                </>
                              ) : (
                                b.result_status
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No bidding data available</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bid Records Modal */}
      {showBidRecordsModal && (
        <BidRecordsModal
          auction={displayAuction}
          onClose={() => setShowBidRecordsModal(false)}
        />
      )}
    </>
  );
};

export default AuctionDetailsModal;
