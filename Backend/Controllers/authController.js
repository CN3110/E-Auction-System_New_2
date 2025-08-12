const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../Config/database'); // Use admin client for database operations

// Hardcoded admin credentials
const ADMIN_CREDENTIALS = {
  user_id: 'ADMIN',
  password: 'admin123' // This should be hashed in production
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
          name: 'System Administrator',
          email: 'admin@eauction.com',
          role: 'admin',
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

    // Find bidder in database using admin client
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('user_id', user_id.toUpperCase())
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();

    if (error) {
      console.log('Database error:', error);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (!user) {
      console.log('User not found:', user_id.toUpperCase());
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

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

    // Get user from database using admin client
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('password_hash')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password using admin client
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ 
        password_hash: hashedPassword,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

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