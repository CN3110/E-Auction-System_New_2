import axios from 'axios';

const API_URL = 'http://localhost:5000/api';



// Set up axios defaults
axios.interceptors.request.use(config => {
    console.log('Interceptor adding token:', localStorage.getItem('token'));

  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['Content-Type'] = 'application/json';
  return config;
});

export const fetchActiveBidders = async () => {
  try {
    const response = await axios.get(`${API_URL}/admin/bidders/active`);
    if (response.data.success) {
      return response.data;
    }
    throw new Error(response.data.error || 'Failed to fetch bidders');
  } catch (error) {
    console.error('Error fetching bidders:', error);
    throw error;
  }
};

export const createAuction = async (auctionData) => {
  try {
    const response = await axios.post(`${API_URL}/auction/create`, auctionData);
    if (response.data.success) {
      return response.data;
    }
    throw new Error(response.data.error || 'Failed to create auction');
  } catch (error) {
    console.error('Error creating auction:', error);
    throw error;
  }
};

export const getAllAuctions = async () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${API_URL}/auction/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch auctions');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Get all auctions error:', error);
    throw error;
  }
};



// Add more auction-related services as needed
export default {
  fetchActiveBidders,
  createAuction,
  getAllAuctions
};


