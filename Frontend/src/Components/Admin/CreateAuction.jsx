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
  Box,
  MenuItem,
  Select,
  FormControl,
  InputLabel
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
    selected_bidders: [],
    category: '',
    sbu: '',
    created_by_name: ''
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [biddersList, setBiddersList] = useState([]);
  const [createdAuctions, setCreatedAuctions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [biddersLoading, setBiddersLoading] = useState(true);
  const [auctionsLoading, setAuctionsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // SBU options
  const sbuOptions = ['KSPA Paper', 'KSPA Packaging', 'Ethimale', 'KSPA Accessories', 'ATIRE']; 

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
      
      const transformedAuctions = data.auctions.map(auction => {
        const [date, time] = auction.DateTime ? auction.DateTime.split(' ') : ['', ''];
        return {
          id: auction.AuctionID,
          auction_id: auction.AuctionID,
          title: auction.Title,
          auction_date: date,
          start_time: time,
          duration_minutes: parseInt(auction.Duration) || 0,
          special_notices: auction.SpecialNotices || '-',
          category: auction.Category || '',
          sbu: auction.SBU || '',
          created_by_name: auction.CreatedByName || '',
          auction_bidders: auction.InvitedBidders ? auction.InvitedBidders.split(', ') : [],
          status: auction.Status ? auction.Status.toLowerCase() : 'ended'
        };
      });
      
      setCreatedAuctions(transformedAuctions || []);
    } catch (error) {
      console.error('Failed to fetch created auctions:', error);
      setCreatedAuctions([]);
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
    
    // Validate required fields
    const requiredFields = [
      { field: 'title', message: 'Auction title is required' },
      { field: 'auction_date', message: 'Auction date is required' },
      { field: 'start_time', message: 'Start time is required' },
      { field: 'category', message: 'Category is required' },
      { field: 'sbu', message: 'SBU is required' },
      { field: 'created_by_name', message: 'Created by is required' }
    ];
    
    for (const { field, message } of requiredFields) {
      if (!formData[field] || !formData[field].toString().trim()) {
        setError(message);
        return;
      }
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
        selected_bidders: [],
        category: '',
        sbu: '',
        created_by_name: ''
      });
      setSearchTerm('');
      
      await loadCreatedAuctions();
      
    } catch (error) {
      setError(error.message || 'Failed to create auction. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getAuctionStatus = (auction) => {
    if (auction.status === 'cancelled') {
      return { status: 'Cancelled', color: 'error' };
    }
    if (auction.status === 'completed') {
      return { status: 'Completed', color: 'success' };
    }
    if (auction.status === 'scheduled') {
      return { status: 'Scheduled', color: 'info' };
    }
    if (auction.status === 'live') {
      return { status: 'Live', color: 'warning' };
    }
    return { status: 'Ended', color: 'default' };
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Invalid Date';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return 'Invalid Date';
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return 'Invalid Time';
    try {
      return new Date(`2000-01-01T${timeStr}`).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return 'Invalid Time';
    }
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
                  min: new Date().toISOString().split('T')[0]
                }}
              />
            </div>
          </div>

          <div className="row mb-3">
            <div className="col-md-4">
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
            <div className="col-md-4">
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
            <div className="col-md-4">
              <FormControl fullWidth>
                <InputLabel id="sbu-label">SBU</InputLabel>
                <Select
                  labelId="sbu-label"
                  name="sbu"
                  value={formData.sbu}
                  onChange={handleChange}
                  label="SBU"
                  required
                  disabled={loading}
                >
                  {sbuOptions.map(sbu => (
                    <MenuItem key={sbu} value={sbu}>{sbu}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </div>
          </div>

          <div className="row mb-3">
            <div className="col-md-6">
              <TextField
                fullWidth
                label="Category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </div>
            <div className="col-md-6">
              <TextField
                fullWidth
                label="Created By"
                name="created_by_name"
                value={formData.created_by_name}
                onChange={handleChange}
                required
                disabled={loading}
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
  type="submit"
  className="custom-auction-btn"
  disabled={loading}
  startIcon={loading ? <CircularProgress size={20} /> : null}
>
  {loading ? 'Creating Auction...' : 'Create Auction'}
</Button>

          </div>
        </form>
      </Card>

     
     </div>
  );
};

export default CreateAuction;