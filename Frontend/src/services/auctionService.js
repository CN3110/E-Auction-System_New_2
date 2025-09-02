import axios from 'axios';

const API_URL = 'http://localhost:5000/api';
//const API_URL = 'https://procubid.anunine.com/api'

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

// to get the current user's role
export const getCurrentUser = async () => {
  try {
    const response = await api.get('/auth/current-user');
    return response.user;
  } catch (error) {
    console.error('Error fetching current user:', error);
    throw error;
  }
};

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

//get all auctions for admin
export const getAllAuctions = async () => {
  try {
    return await api.get(`${API_URL}/auction/all`);
  } catch (error) {
    console.error('Get all auctions error:', error);
    throw error;
  }
};

//get auction details for admin
export const getAuctionDetails = async (auctionId) => {
  try {
    const response = await api.get(`${API_URL}/auction/${auctionId}`);
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
    const response = await api.get(`${API_URL}/auction/live/${auctionId}/rankings`);
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
    return await api.put(`${API_URL}/auction/${auctionId}`, updateData);
  } catch (error) {
    console.error('Update auction error:', error);
    throw error;
  }
};

export const deleteAuction = async (auctionId) => {
  try {
    return await api.delete(`${API_URL}/auction/${auctionId}`);
  } catch (error) {
    console.error('Delete auction error:', error);
    throw error;
  }
};

// Add these functions to your existing auctionService.js file

/**
 * Approve an auction (System Admin only)
 */
export const approveAuction = async (auctionId) => {
  try {
    const response = await fetch(`${API_URL}/auction/${auctionId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error approving auction:', error);
    throw error;
  }
};

/**
 * Reject an auction (System Admin only)
 */
export const rejectAuction = async (auctionId, reason = '') => {
  try {
    const response = await fetch(`${API_URL}/auction/${auctionId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ reason })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error rejecting auction:', error);
    throw error;
  }
};

// Helper function to get token (make sure this exists in your service)
const getToken = () => {
  return localStorage.getItem('token');
};

// Add these functions to your Frontend/src/services/auctionService.js

/**
 * Get detailed statistics for a specific auction
 * @param {string} auctionId - The auction ID
 * @returns {Promise} - Promise resolving to auction statistics
 */
export const getAuctionStatistics = async (auctionId) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }

    console.log('Fetching auction statistics for:', auctionId);

    const response = await fetch(`${API_URL}/auction/${auctionId}/statistics`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch auction statistics');
    }

    console.log('Auction statistics received:', data);
    return data;

  } catch (error) {
    console.error('Error fetching auction statistics:', error);
    throw error;
  }
};

export const getActivelyParticipatingBidders = async (auctionId) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }

    console.log('Fetching actively participating bidders for:', auctionId);

    const response = await fetch(`${API_URL}/auction/${auctionId}/active-bidders`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch actively participating bidders');
    }

    console.log('Active bidders data received:', data);
    return data;

  } catch (error) {
    console.error('Error fetching actively participating bidders:', error);
    throw error;
  }
};

/**
 * Get comprehensive auction data including statistics and active bidders
 * @param {string} auctionId - The auction ID
 * @returns {Promise} - Promise resolving to comprehensive auction data
 */
export const getAuctionComprehensiveData = async (auctionId) => {
  try {
    console.log('Fetching comprehensive auction data for:', auctionId);

    // Fetch both statistics and active bidders data in parallel
    const [statsResponse, biddersResponse] = await Promise.all([
      getAuctionStatistics(auctionId),
      getActivelyParticipatingBidders(auctionId)
    ]);

    const comprehensiveData = {
      statistics: statsResponse.stats,
      active_bidders: biddersResponse.active_bidders,
      summary: biddersResponse.summary,
      auction_info: biddersResponse.auction,
      current_time_sl: statsResponse.current_time_sl || biddersResponse.current_time_sl,
      last_updated: statsResponse.stats?.last_updated
    };

    console.log('Comprehensive auction data received:', comprehensiveData);
    return comprehensiveData;

  } catch (error) {
    console.error('Error fetching comprehensive auction data:', error);
    throw error;
  }
};

// Add these functions to your existing auctionService.js file

/**
 * Get top 5 bidders for an auction
 */
// auctionService.js - Add this function if it doesn't exist
export const getTopBidders = async (auctionId) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/auction/${auctionId}/top-bidders`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Server returned non-JSON response');
    }

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }
    
    return data;
  } catch (error) {
    console.error('Get top bidders error:', error);
    throw error;
  }
};

/**
 * Award a bidder for an auction
 */
export const awardBidder = async (auctionId, bidderId) => {
  try {
    const response = await fetch(`${API_URL}/auction/${auctionId}/award/${bidderId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to award bidder');
    }

    return result;
  } catch (error) {
    console.error('Award bidder error:', error);
    throw error;
  }
};

/**
 * Disqualify a bidder for an auction
 */
export const disqualifyBidder = async (auctionId, bidderId, reason) => {
  try {
    const response = await fetch(`${API_URL}/auction/${auctionId}/disqualify/${bidderId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to disqualify bidder');
    }

    return result;
  } catch (error) {
    console.error('Disqualify bidder error:', error);
    throw error;
  }
};

/**
 * Get all bid records for an auction
 */
export const getAllAuctionBids = async (auctionId) => {
  try {
    const response = await fetch(`${API_URL}/auction/${auctionId}/all-bids`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to fetch auction bids');
    }

    return result;
  } catch (error) {
    console.error('Get auction bids error:', error);
    throw error;
  }
};

// Add these functions to your Frontend/src/services/auctionService.js

/**
 * Shortlist top 5 bidders for an auction
 */
export const shortlistTopBidders = async (auctionId) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${API_URL}/auction/${auctionId}/shortlist`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Shortlist bidders error:', error);
    throw error;
  }
};

/**
 * Mark bidder as not awarded
 */
export const markBidderNotAwarded = async (auctionId, bidderId) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${API_URL}/auction/${auctionId}/not-award/${bidderId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Mark not awarded error:', error);
    throw error;
  }
};

/**
 * Cancel auction
 */
export const cancelAuction = async (auctionId, reason) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error('Cancellation reason is required');
    }

    const response = await fetch(`${API_URL}/auction/${auctionId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Cancel auction error:', error);
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
  getAuctionStatistics,
  getActivelyParticipatingBidders,
  getTopBidders,
  awardBidder,
  disqualifyBidder,
  getAllAuctionBids,
  shortlistTopBidders,        // NEW
  markBidderNotAwarded,       // NEW
  cancelAuction,              // NEW
};