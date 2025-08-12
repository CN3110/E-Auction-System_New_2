import React, { useState, useEffect } from 'react';
import { 
  TextField, 
  Button, 
  Checkbox, 
  FormControlLabel, 
  TextareaAutosize, 
  CircularProgress, 
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Typography,
  Box
} from '@mui/material';
import '../../styles/createAuction.css';
import Card from '../Common/Card';
import { 
  fetchActiveBidders, 
  createAuction,
  getAllAuctions 
} from '../../services/auctionService';

const CreateAuction = () => {
  const [formData, setFormData] = useState({
    title: '',
    auction_date: '',
    start_time: '',
    duration_minutes: 30,
    special_notices: '',
    selected_bidders: []
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [biddersList, setBiddersList] = useState([]);
  const [createdAuctions, setCreatedAuctions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [biddersLoading, setBiddersLoading] = useState(true);
  const [auctionsLoading, setAuctionsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const loadBidders = async () => {
      try {
        setBiddersLoading(true);
        const data = await fetchActiveBidders();
        setBiddersList(data.bidders);
      } catch {
        setError('Failed to fetch bidders');
      } finally {
        setBiddersLoading(false);
      }
    };
    loadBidders();
  }, []);

  useEffect(() => {
    loadCreatedAuctions();
  }, []);

  const loadCreatedAuctions = async () => {
    try {
      setAuctionsLoading(true);
      const data = await getAllAuctions();
      setCreatedAuctions(data.auctions || []);
    } catch (error) {
      console.error('Failed to fetch created auctions:', error);
    } finally {
      setAuctionsLoading(false);
    }
  };

  const filteredBidders = biddersList.filter(bidder =>
    bidder.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bidder.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bidder.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
    if (success) setSuccess('');
  };

  const handleCheckboxChange = (e) => {
    const { checked, value } = e.target;
    setFormData(prev => ({
      ...prev,
      selected_bidders: checked
        ? [...prev.selected_bidders, value]
        : prev.selected_bidders.filter(b => b !== value)
    }));
  };

  const handleSelectAll = (e) => {
    const { checked } = e.target;
    const filteredIds = filteredBidders.map(bidder => bidder.id);
    setFormData(prev => ({
      ...prev,
      selected_bidders: checked
        ? [...new Set([...prev.selected_bidders, ...filteredIds])]
        : prev.selected_bidders.filter(bidderId => !filteredIds.includes(bidderId))
    }));
  };

  const isAllSelected =
    filteredBidders.length > 0 &&
    filteredBidders.every(bidder => formData.selected_bidders.includes(bidder.id));

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      setError('Auction title is required');
      return;
    }
    
    if (!formData.auction_date) {
      setError('Auction date is required');
      return;
    }
    
    if (!formData.start_time) {
      setError('Start time is required');
      return;
    }
    
    if (formData.selected_bidders.length === 0) {
      setError('Please select at least one bidder');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      
      const data = await createAuction(formData);
      
      setSuccess(`Auction "${formData.title}" created successfully with ID: ${data.auction_id}`);
      setFormData({
        title: '',
        auction_date: '',
        start_time: '',
        duration_minutes: 30,
        special_notices: '',
        selected_bidders: []
      });
      setSearchTerm('');
      
      // Reload the created auctions list
      await loadCreatedAuctions();
      
    } catch (error) {
      setError(error.message || 'Failed to create auction. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getAuctionStatus = (auction) => {
    const now = new Date();
    const auctionDateTime = new Date(`${auction.auction_date}T${auction.start_time}`);
    const endDateTime = new Date(auctionDateTime.getTime() + (auction.duration_minutes * 60000));
    
    if (auction.status === 'cancelled') {
      return { status: 'Cancelled', color: 'error' };
    } else if (auction.status === 'completed') {
      return { status: 'Completed', color: 'success' };
    } else if (now < auctionDateTime) {
      return { status: 'Scheduled', color: 'info' };
    } else if (now >= auctionDateTime && now <= endDateTime) {
      return { status: 'Live', color: 'warning' };
    } else {
      return { status: 'Ended', color: 'default' };
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (timeStr) => {
    return new Date(`2000-01-01T${timeStr}`).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  if (biddersLoading) {
    return (
      <div className="container my-4 text-center">
        <CircularProgress />
        <p className="mt-2">Loading bidders...</p>
      </div>
    );
  }

  return (
    <div className="container my-1">
      {/* Create Auction Form */}
      <Card>
        {error && (
          <Alert severity="error" className="mb-3" onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert severity="success" className="mb-3" onClose={() => setSuccess('')}>
            {success}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          
          <div className="row mb-3">
            <div className="col-md-6">
              <TextField
                fullWidth
                label="Auction Title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </div>
            <div className="col-md-6">
              <TextField
                fullWidth
                type="date"
                name="auction_date"
                label="Auction Date"
                value={formData.auction_date}
                onChange={handleChange}
                InputLabelProps={{ shrink: true }}
                required
                disabled={loading}
                inputProps={{
                  min: new Date().toISOString().split('T')[0] // Prevent past dates
                }}
              />
            </div>
          </div>

          <div className="row mb-3">
            <div className="col-md-6">
              <TextField
                fullWidth
                type="time"
                name="start_time"
                label="Start Time"
                value={formData.start_time}
                onChange={handleChange}
                InputLabelProps={{ shrink: true }}
                required
                disabled={loading}
              />
            </div>
            <div className="col-md-6">
              <TextField
                fullWidth
                type="number"
                name="duration_minutes"
                label="Duration (minutes)"
                value={formData.duration_minutes}
                onChange={handleChange}
                required
                disabled={loading}
                inputProps={{ min: 1, max: 1440 }}
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label">Special Notices</label>
            <TextareaAutosize
              minRows={3}
              name="special_notices"
              value={formData.special_notices}
              onChange={handleChange}
              className="form-control"
              placeholder="Enter any special instructions or notices"
              disabled={loading}
            />
          </div>

          {/* Bidders Selection */}
          <div className="mb-4">
            <label className="form-label">Select Bidders</label>
            <div className="card p-3">
              <div className="d-flex flex-column flex-md-row mb-3 gap-2">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search bidders by name, company, or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  disabled={loading}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      disabled={loading || filteredBidders.length === 0}
                    />
                  }
                  label={`Select All (${filteredBidders.length})`}
                />
              </div>

              <div className="bidders-scroll-box border rounded p-2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {filteredBidders.length > 0 ? (
                  filteredBidders.map(bidder => (
                    <div key={bidder.id} className="form-check mb-2">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={bidder.id}
                        value={bidder.id}
                        checked={formData.selected_bidders.includes(bidder.id)}
                        onChange={handleCheckboxChange}
                        disabled={loading}
                      />
                      <label className="form-check-label" htmlFor={bidder.id}>
                        <div>
                          <strong>{bidder.name}</strong> ({bidder.user_id})
                          {bidder.company && <div className="text-muted small">{bidder.company}</div>}
                        </div>
                      </label>
                    </div>
                  ))
                ) : (
                  <div className="text-muted text-center">
                    {searchTerm ? 'No bidders found matching your search' : 'No active bidders available'}
                  </div>
                )}
              </div>
              <div className="text-end text-secondary mt-2">
                {formData.selected_bidders.length} of {biddersList.length} bidders selected
              </div>
            </div>
          </div>

          <div className="text-center">
            <Button 
              variant="contained" 
              color="warning" 
              type="submit"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : null}
            >
              {loading ? 'Creating Auction...' : 'Create Auction'}
            </Button>
          </div>
        </form>
      </Card>

      {/* View Created Auctions Table */}
      <Box sx={{ mt: 4 }}>
        <Card>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
            Created Auctions
          </Typography>
          
          {auctionsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
              <CircularProgress />
              <Typography sx={{ ml: 2 }}>Loading auctions...</Typography>
            </Box>
          ) : createdAuctions.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                No auctions created yet
              </Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Auction ID</strong></TableCell>
                    <TableCell><strong>Title</strong></TableCell>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell><strong>Time</strong></TableCell>
                    <TableCell><strong>Duration</strong></TableCell>
                    <TableCell><strong>Special Notices</strong></TableCell>
                    <TableCell><strong>Invited Bidders</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {createdAuctions.map((auction) => {
                    const statusInfo = getAuctionStatus(auction);
                    return (
                      <TableRow key={auction.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {auction.auction_id}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {auction.title}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(auction.auction_date)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatTime(auction.start_time)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {auction.duration_minutes} mins
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              maxWidth: 200, 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={auction.special_notices}
                          >
                            {auction.special_notices || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="primary">
                            {auction.auction_bidders?.length || 0} bidders
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={statusInfo.status}
                            color={statusInfo.color}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      </Box>
    </div>
  );
};

export default CreateAuction;