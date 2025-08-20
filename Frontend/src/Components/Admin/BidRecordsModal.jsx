import React, { useState, useEffect } from 'react';
import "../../styles/BidRecordsModal.css";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";

const BidRecordsModal = ({ auction, onClose }) => {
  const [bidRecords, setBidRecords] = useState([]);
  const [filteredBids, setFilteredBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter states
  const [filters, setFilters] = useState({
    bidder: ''
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

  /**
   * Export data to Excel using XLSX
   */
  const exportToExcel = () => {
    if (filteredBids.length === 0) {
      alert('No data to export');
      return;
    }

    // Prepare data for Excel
    const worksheetData = filteredBids.map(bid => ({
      'Bid Time': new Date(bid.bid_time).toLocaleString('en-GB'),
      'Bidder Name': bid.bidder_name || 'N/A',
      'Company': bid.company_name || 'Not specified',
      'Bid Amount (LKR)': parseFloat(bid.bid_amount)
      
    }));

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bid Records');
    
    // Generate Excel file
    const auctionId = auction.auction_id || auction.AuctionID;
    const fileName = `bid_records_${auctionId}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    XLSX.writeFile(workbook, fileName);
  };

  /**
   * Export data to PDF using jsPDF (manual table creation)
   */
  const exportToPDF = () => {
    if (filteredBids.length === 0) {
      alert('No data to export');
      return;
    }

    // Create new PDF document
    const doc = new jsPDF();
    const auctionId = auction.auction_id || auction.AuctionID;
    const auctionTitle = auction.title || auction.Title;
    const currentDate = new Date().toLocaleString('en-GB');
    
    // Add title
    doc.setFontSize(18);
    doc.text(`Bid Records - ${auctionId}`, 14, 22);
    
    // Add subtitle
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Auction: ${auctionTitle}`, 14, 30);
    doc.text(`Generated on: ${currentDate}`, 14, 35);
    doc.text(`Total Records: ${filteredBids.length}`, 14, 40);
    
    // Define table parameters
    const startY = 50;
    const lineHeight = 7;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 14;
    let currentY = startY;
    
    // Table headers
    const headers = ['Bid Time', 'Bidder Name', 'Company', 'Bid Amount'];
    const columnWidths = [40, 40, 40, 30];
    
    // Draw table headers
    doc.setFillColor(41, 128, 185);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    
    let currentX = margin;
    headers.forEach((header, i) => {
      doc.rect(currentX, currentY, columnWidths[i], lineHeight, 'F');
      doc.text(header, currentX + 2, currentY + 5);
      currentX += columnWidths[i];
    });
    
    currentY += lineHeight;
    
    // Table data
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    
    filteredBids.forEach((bid, index) => {
      // Check if we need a new page
      if (currentY > pageHeight - 20) {
        doc.addPage();
        currentY = margin;
        
        // Redraw headers on new page
        doc.setFillColor(41, 128, 185);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        
        currentX = margin;
        headers.forEach((header, i) => {
          doc.rect(currentX, currentY, columnWidths[i], lineHeight, 'F');
          doc.text(header, currentX + 2, currentY + 5);
          currentX += columnWidths[i];
        });
        
        currentY += lineHeight;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
      }
      
      // Alternate row colors
      if (index % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        currentX = margin;
        columnWidths.forEach(width => {
          doc.rect(currentX, currentY, width, lineHeight, 'F');
          currentX += width;
        });
      }
      
      // Row data
      currentX = margin;
      const rowData = [
        new Date(bid.bid_time).toLocaleString('en-GB'),
        bid.bidder_name || 'N/A',
        bid.company_name || 'Not specified',
        formatCurrency(bid.bid_amount)
        
      ];
      
      rowData.forEach((data, i) => {
        doc.text(data.toString(), currentX + 2, currentY + 5);
        currentX += columnWidths[i];
      });
      
      currentY += lineHeight;
    });
    
    // Add page numbers
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 10, { align: 'center' });
    }
    
    // Save the PDF
    doc.save(`bid_records_${auctionId}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Calculate pagination
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentRecords = filteredBids.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = Math.ceil(filteredBids.length / recordsPerPage);

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
          </div>
          
          <div className="action-buttons">
            <button className="btn btn-export" onClick={exportToExcel}>
              📊 Export Excel
            </button>
            <button className="btn btn-export" onClick={exportToPDF} style={{marginLeft: '10px'}}>
              📄 Export PDF
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