import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

// Configure axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for consistent error handling
api.interceptors.response.use(
  response => response.data,
  error => {
    const message = error.response?.data?.error || 
                   error.response?.data?.message || 
                   error.message || 
                   'Request failed';
    console.error('API Error:', message);
    throw new Error(message);
  }
);

export const fetchActiveBidders = async () => {
  try {
    return await api.get('/admin/bidders/active');
  } catch (error) {
    console.error('Error fetching bidders:', error);
    throw error;
  }
};

export const createAuction = async (auctionData) => {
  try {
    return await api.post('/auction/create', auctionData);
  } catch (error) {
    console.error('Error creating auction:', error);
    throw error;
  }
};

export const getAllAuctions = async () => {
  try {
    return await api.get('/auction/');
  } catch (error) {
    console.error('Get all auctions error:', error);
    throw error;
  }
};

export const getAuctionDetails = async (auctionId) => {
  try {
    const response = await api.get(`/auction/${auctionId}`);
    return {
      success: true,
      auction: {
        ...response.auction,
        // Ensure consistent field names
        auction_bidders: response.auction.invited_bidders || [],
        calculated_status: response.auction.calculated_status || response.auction.status,
        is_live: response.auction.is_live || false
      }
    };
  } catch (error) {
    console.error('Get auction details error:', error);
    throw new Error('Failed to fetch auction details');
  }
};

export const getAuctionRankings = async (auctionId) => {
  try {
    const response = await api.get(`/auction/${auctionId}/rankings`);
    return {
      success: true,
      rankings: response.rankings || []
    };
  } catch (error) {
    console.error('Get auction rankings error:', error);
    throw new Error('Failed to fetch auction rankings');
  }
};

export const updateAuction = async (auctionId, updateData) => {
  try {
    return await api.put(`/auction/${auctionId}`, updateData);
  } catch (error) {
    console.error('Update auction error:', error);
    throw error;
  }
};

export const deleteAuction = async (auctionId) => {
  try {
    return await api.delete(`/auction/${auctionId}`);
  } catch (error) {
    console.error('Delete auction error:', error);
    throw error;
  }
};

export const getAuctionStatistics = async (auctionId) => {
  try {
    return await api.get(`/auction/${auctionId}/statistics`);
  } catch (error) {
    console.error('Get auction statistics error:', error);
    throw error;
  }
};

// Export methods for use in components
export default {
  fetchActiveBidders,
  createAuction,
  getAllAuctions,
  getAuctionDetails,
  getAuctionRankings,
  updateAuction,
  deleteAuction,
  getAuctionStatistics
};