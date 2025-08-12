const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../Config/database');

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Handle admin authentication (hardcoded admin)
    if (decoded.user_id === 'ADMIN') {
      req.user = {
        id: 'admin-hardcoded-id',
        user_id: 'ADMIN',
        name: 'System Administrator',
        email: 'admin@eauction.com',
        role: 'admin',
        company: 'Anunine Holdings Pvt Ltd',
        is_active: true
      };
      return next();
    }

    // Handle bidder authentication (database lookup)
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();

    if (error || !user) {
      console.log('User authentication failed:', error || 'User not found');
      throw new Error('User not found or inactive');
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    res.status(401).json({ success: false, error: 'Please authenticate' });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        error: `Role ${req.user.role} is not allowed to access this resource` 
      });
    }
    next();
  };
};

// Legacy middleware names for backward compatibility
const authenticateToken = authenticate;
const requireAdmin = authorizeRoles('admin');
const requireBidder = authorizeRoles('bidder');

module.exports = { 
  authenticate, 
  authorizeRoles,
  authenticateToken,
  requireAdmin,
  requireBidder
};