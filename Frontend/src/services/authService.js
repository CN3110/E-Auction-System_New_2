// Frontend/src/services/authService.js
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';
//const API_URL = 'https://procubid.anunine.com/api'

// Configure axios instance for auth
const authApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
authApi.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor
authApi.interceptors.response.use(
  response => response.data,
  error => {
    const message = error.response?.data?.error || 
                   error.response?.data?.message || 
                   error.message || 
                   'Request failed';
    console.error('Auth API Error:', message);
    
    // Handle token expiration or unauthorized access
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Redirect to login or refresh page
      window.location.href = '/login';
    }
    
    throw new Error(message);
  }
);

/**
 * Login user
 */
export const login = async (user_id, password) => {
  try {
    const response = await authApi.post('/auth/login', { user_id, password });
    
    if (response.success) {
      // Store token and user data
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      return response;
    }
    
    throw new Error(response.error || 'Login failed');
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

/**
 * Get current logged user's information including role
 */
export const getCurrentUser = async () => {
  try {
    const response = await authApi.get('/auth/current-user');
    
    if (response.success) {
      // Update stored user data with latest info
      localStorage.setItem('user', JSON.stringify(response.user));
      return response.user;
    }
    
    throw new Error('Failed to get current user');
  } catch (error) {
    console.error('Error fetching current user:', error);
    // If request fails, try to get from localStorage as fallback
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      return JSON.parse(storedUser);
    }
    throw error;
  }
};

/**
 * Get current user from localStorage (synchronous)
 */
export const getCurrentUserSync = () => {
  try {
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser) : null;
  } catch (error) {
    console.error('Error parsing stored user data:', error);
    return null;
  }
};

/**
 * Check if user has a specific role
 */
export const hasRole = (requiredRole) => {
  const user = getCurrentUserSync();
  return user?.role === requiredRole;
};

/**
 * Check if user is admin (regular admin or system admin)
 */
export const isAdmin = () => {
  const user = getCurrentUserSync();
  return user?.role === 'admin' || user?.role === 'system_admin';
};

/**
 * Check if user is system admin
 */
export const isSystemAdmin = () => {
  const user = getCurrentUserSync();
  return user?.role === 'system_admin';
};

/**
 * Check if user is regular admin
 */
export const isRegularAdmin = () => {
  const user = getCurrentUserSync();
  return user?.role === 'admin';
};

/**
 * Check if user is bidder
 */
export const isBidder = () => {
  const user = getCurrentUserSync();
  return user?.role === 'bidder';
};

/**
 * Get user role
 */
export const getUserRole = () => {
  const user = getCurrentUserSync();
  return user?.role || null;
};

/**
 * Logout user
 */
export const logout = () => {
  localStorage.removeItem('termsAccepted');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/';
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  return !!(token && user);
};

/**
 * Change password
 */
export const changePassword = async (currentPassword, newPassword) => {
  try {
    const response = await authApi.post('/auth/change-password', {
      currentPassword,
      newPassword
    });
    
    return response;
  } catch (error) {
    console.error('Error changing password:', error);
    throw error;
  }
};

export default {
  login,
  getCurrentUser,
  getCurrentUserSync,
  hasRole,
  isAdmin,
  isSystemAdmin,
  isRegularAdmin,
  isBidder,
  getUserRole,
  logout,
  isAuthenticated,
  changePassword
};