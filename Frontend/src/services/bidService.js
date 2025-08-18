import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

// Set up axios defaults
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['Content-Type'] = 'application/json';
  return config;
});

//get live auctions for invited bidders
export const getLiveAuctionsForBidder = async () => {
  try {
    const response = await axios.get(`http://localhost:5000/api/auction/live/bidder`);
    return response.data.auction;
  } catch (error) {
    console.error('Error fetching live auction:', error);
    throw error;
  }
};

export const placeBid = async (auctionId, amount) => {
  try {
    const response = await axios.post(`${API_URL}/auctions/${auctionId}/bids`, { amount });
    return response.data;
  } catch (error) {
    console.error('Error placing bid:', error);
    throw error;
  }
};

export const getBidderRank = async (auctionId) => {
  try {
    const response = await axios.get(`${API_URL}/auctions/${auctionId}/rankings`);
    return response.data.rankings.find(rank => rank.bidder_id === localStorage.getItem('userId'));
  } catch (error) {
    console.error('Error fetching bidder rank:', error);
    throw error;
  }
};

export const getMinBidAmount = async (auctionId) => {
  try {
    const response = await axios.get(`${API_URL}/auctions/${auctionId}/min-bid`);
    return response.data.minBid;
  } catch (error) {
    console.error('Error fetching min bid amount:', error);
    throw error;
  }
};

export default {
  getLiveAuctions,
  placeBid,
  getBidderRank,
  getMinBidAmount
};