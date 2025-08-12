import axios from 'axios';

const API_URL = 'http://localhost:5000/api/admin'; // Adjust based on your backend URL

export const addBidder = async (bidderData) => {
  try {
    console.log('Adding bidder:', bidderData);
    const response = await axios.post(`${API_URL}/bidders`, bidderData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Full error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw new Error(error.response?.data?.error || 'Failed to add bidder');
  }
};

export const fetchBidders = async () => {
  try {
    const response = await axios.get(`${API_URL}/bidders`);
    return response.data.bidders;
  } catch (error) {
    console.error('Error fetching bidders:', error);
    throw error;
  }
};

export const deactivateBidder = async (bidderId) => {
  try {
    const response = await axios.patch(
      `${API_URL}/bidders/${bidderId}/deactivate`
    );
    return response.data;
  } catch (error) {
    console.error('Deactivation failed:', error.response?.data || error.message);
    throw error;
  }
};

export const reactivateBidder = async (bidderId) => {
  try {
    const response = await axios.patch(
      `${API_URL}/bidders/${bidderId}/reactivate`
    );
    return response.data;
  } catch (error) {
    console.error('Reactivation failed:', error.response?.data || error.message);
    throw error;
  }
};