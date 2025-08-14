// src/utils/auth.js

/**
 * Get current user from localStorage
 */
export const getCurrentUser = () => {
  try {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch (error) {
    console.error('Error parsing user from localStorage:', error);
    return null;
  }
};

/**
 * Get current user's role
 */
export const getCurrentUserRole = () => {
  const user = getCurrentUser();
  return user?.role || null;
};

/**
 * Check if current user is admin (either admin or system_admin)
 */
export const isAdmin = () => {
  const role = getCurrentUserRole();
  return role === 'admin' || role === 'system_admin';
};

/**
 * Check if current user is system admin specifically
 */
export const isSystemAdmin = () => {
  const role = getCurrentUserRole();
  return role === 'system_admin';
};

/**
 * Check if current user is regular admin (not system admin)
 */
export const isRegularAdmin = () => {
  const role = getCurrentUserRole();
  return role === 'admin';
};

/**
 * Check if current user is bidder
 */
export const isBidder = () => {
  const role = getCurrentUserRole();
  return role === 'bidder';
};

/**
 * Check if user has specific role
 */
export const hasRole = (requiredRole) => {
  const role = getCurrentUserRole();
  return role === requiredRole;
};

/**
 * Check if user has any of the specified roles
 */
export const hasAnyRole = (requiredRoles = []) => {
  const role = getCurrentUserRole();
  return requiredRoles.includes(role);
};

/**
 * Get user's display name
 */
export const getUserDisplayName = () => {
  const user = getCurrentUser();
  return user?.name || 'User';
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  const token = localStorage.getItem('token');
  const user = getCurrentUser();
  return !!(token && user);
};

/**
 * Logout user (clear localStorage)
 */
export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

/**
 * Debug function to log current user info
 */
export const debugUserInfo = () => {
  const user = getCurrentUser();
  const role = getCurrentUserRole();
  console.log('=== User Debug Info ===');
  console.log('User:', user);
  console.log('Role:', role);
  console.log('Is Admin:', isAdmin());
  console.log('Is System Admin:', isSystemAdmin());
  console.log('Is Regular Admin:', isRegularAdmin());
  console.log('Is Bidder:', isBidder());
  console.log('======================');
  return { user, role };
};