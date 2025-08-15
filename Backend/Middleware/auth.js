const jwt = require('jsonwebtoken');
const { query } = require('../Config/database');

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // FIXED: Handle admin authentication with proper database UUID
    if (decoded.user_id === 'ADMIN') {
      // Get the actual admin user from database to get the real UUID
      const { data: adminUser, error: adminError } = await query(
        'SELECT * FROM users WHERE user_id = ? AND role = ? AND is_active = TRUE',
        ['ADMIN', 'admin']
      );

      if (adminError || !adminUser || adminUser.length === 0) {
        console.error('Admin user not found in database:', adminError);
        return res.status(401).json({ 
          success: false, 
          error: 'Administrator not found' 
        });
      }

      // Use the real database record, not hardcoded values
      req.user = adminUser[0];
      console.log('Admin authenticated with database ID:', req.user.id);
      return next();
    }

    // FIXED: Handle system admin authentication - GET THE REAL DATABASE ID
    if (decoded.user_id === 'SYSADMIN') {
      // Get the actual system admin user from database to get the real UUID
      const { data: sysAdmin, error: sysAdminError } = await query(
        'SELECT * FROM users WHERE user_id = ? AND role = ? AND is_active = TRUE',
        ['SYSADMIN', 'system_admin']
      );

      if (sysAdminError || !sysAdmin || sysAdmin.length === 0) {
        console.error('System admin not found in database:', sysAdminError);
        return res.status(401).json({ 
          success: false, 
          error: 'System administrator not found' 
        });
      }

      // Use the real database record, not hardcoded values
      req.user = sysAdmin[0];
      console.log('System admin authenticated with database ID:', req.user.id);
      return next();
    }

    // Handle bidder authentication (database lookup)
    const { data: users, error } = await query(
      'SELECT * FROM users WHERE id = ? AND is_active = TRUE AND deleted_at IS NULL',
      [decoded.id]
    );

    if (error || !users || users.length === 0) {
      console.log('User authentication failed:', error || 'User not found');
      throw new Error('User not found or inactive');
    }

    req.user = users[0];
    console.log('User authenticated:', req.user.user_id, 'with ID:', req.user.id);
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
const requireSystemAdmin = authorizeRoles('system_admin');
const requireAdminOrSystemAdmin = authorizeRoles('admin', 'system_admin');

module.exports = { 
  authenticate, 
  authorizeRoles,
  authenticateToken,
  requireAdmin,
  requireBidder,
  requireSystemAdmin,
  requireAdminOrSystemAdmin
};