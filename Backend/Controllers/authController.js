const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../Config/database');

// Hardcoded admin and system admin credentials
const ADMIN_CREDENTIALS = {
  user_id: 'ADMIN',
  password: 'admin123', // This should be hashed in production
  role: 'admin',
  name: 'Administrator'
};

const SYSADMIN_CREDENTIALS = {
  user_id: 'SYSADMIN',
  password: 'sysadmin123', // This should be hashed in production
  role: 'system_admin',
  name: 'System Administrator'
};

const login = async (req, res) => {
  try {
    const { user_id, password } = req.body;

    console.log('Login attempt:', { user_id, password: '***' }); // Debug log

    // Handle admin login
    if (user_id.toUpperCase() === ADMIN_CREDENTIALS.user_id) {
      console.log('Admin login attempt detected');
      
      if (password !== ADMIN_CREDENTIALS.password) {
        console.log('Admin password mismatch');
        return res.status(401).json({ success: false, error: 'Invalid admin credentials' });
      }

      // Generate JWT token for admin without expiration
      const token = jwt.sign(
        { id: 'admin-hardcoded-id', role: 'admin', user_id: ADMIN_CREDENTIALS.user_id }, 
        process.env.JWT_SECRET
      );

      console.log('Admin login successful');
      return res.json({
        success: true,
        token,
        user: {
          id: 'admin-hardcoded-id',
          user_id: ADMIN_CREDENTIALS.user_id,
          name: ADMIN_CREDENTIALS.name,
          email: 'admin@eauction.com',
          role: 'admin',
          company: 'Anunine Holdings Pvt Ltd'
        }
      });
    }

    // Handle system admin login
    if (user_id.toUpperCase() === SYSADMIN_CREDENTIALS.user_id) {
      console.log('System Admin login attempt detected');
      
      if (password !== SYSADMIN_CREDENTIALS.password) {
        console.log('System Admin password mismatch');
        return res.status(401).json({ success: false, error: 'Invalid system admin credentials' });
      }

      // Generate JWT token for system admin without expiration
      const token = jwt.sign(
        { id: 'sysadmin-hardcoded-id', role: 'system_admin', user_id: SYSADMIN_CREDENTIALS.user_id }, 
        process.env.JWT_SECRET
      );

      console.log('System Admin login successful');
      return res.json({
        success: true,
        token,
        user: {
          id: 'sysadmin-hardcoded-id',
          user_id: SYSADMIN_CREDENTIALS.user_id,
          name: SYSADMIN_CREDENTIALS.name,
          email: 'sysadmin@eauction.com',
          role: 'system_admin',
          company: 'Anunine Holdings Pvt Ltd'
        }
      });
    }

    // Handle bidder login (user_id starts with 'B')
    if (!user_id.toUpperCase().startsWith('B')) {
      console.log('Invalid user ID format:', user_id);
      return res.status(401).json({ success: false, error: 'Invalid user ID format' });
    }

    console.log('Bidder login attempt for:', user_id.toUpperCase());

    // Find bidder in database
    const { data: users, error } = await query(
      'SELECT * FROM users WHERE user_id = ? AND is_active = TRUE AND deleted_at IS NULL',
      [user_id.toUpperCase()]
    );

    if (error) {
      console.log('Database error:', error);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (!users || users.length === 0) {
      console.log('User not found:', user_id.toUpperCase());
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = users[0];
    console.log('User found:', user.user_id);

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.log('Password mismatch for user:', user.user_id);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check if user is active (double check)
    if (!user.is_active) {
      console.log('User account is deactivated:', user.user_id);
      return res.status(403).json({ success: false, error: 'Account is deactivated' });
    }

    // Generate JWT token for bidder without expiration
    const token = jwt.sign(
      { id: user.id, role: user.role, user_id: user.user_id }, 
      process.env.JWT_SECRET
    );

    console.log('Bidder login successful:', user.user_id);

    res.json({ 
      success: true, 
      token,
      user: {
        id: user.id,
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        company: user.company
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Get user from database
    const { data: users, error: userError } = await query(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    if (userError) throw userError;

    if (!users || users.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = users[0];

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const { error: updateError } = await query(
      'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
      [hashedPassword, userId]
    );

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  login,
  changePassword
};