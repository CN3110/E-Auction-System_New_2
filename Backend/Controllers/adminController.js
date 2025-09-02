const { query, transaction } = require('../Config/database');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('../Config/email');
const { generateBidderId, generatePassword } = require('../Utils/generators');

const registerBidder = async (req, res) => {
  try {
    console.log('Request body:', req.body);
    const { name, email, company, phone } = req.body;
    
    // Validate required fields
    if (!name || !email || !company) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields (name, email, company)' 
      });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid email format' 
      });
    }

    // Check if email already exists
    const { data: existingUser, error: existingUserError } = await query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUserError) throw existingUserError;
    if (existingUser && existingUser.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'Email already registered' 
      });
    }

    // Get last bidder ID
    const { data: lastBidder, error: lastBidderError } = await query(
      'SELECT user_id FROM users WHERE user_id LIKE "B%" ORDER BY user_id DESC LIMIT 1'
    );
    
    if (lastBidderError) throw lastBidderError;
    
    const lastBidderId = lastBidder && lastBidder[0]?.user_id;
    const bidderId = generateBidderId(lastBidderId);
    
    // Validate generated ID
    if (!bidderId || bidderId.includes('NaN')) {
      throw new Error('Failed to generate valid bidder ID');
    }

    const password = generatePassword();
    const hashedPassword = await bcrypt.hash(password, 10);
    
    console.log('Creating bidder with:', {
      bidderId, email, name, company, phone
    });

    // Insert new bidder
    const { data, error } = await query(
      `INSERT INTO users (user_id, email, password_hash, role, name, company, phone, is_active) 
       VALUES (?, ?, ?, 'bidder', ?, ?, ?, TRUE)`,
      [bidderId, email, hashedPassword, name, company, phone || null]
    );
    
    if (error) {
      console.error('MySQL insert error:', error);
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ 
          success: false, 
          error: 'Bidder ID already exists. Please try again.' 
        });
      }
      throw error;
    }

    // Get the created bidder
    const { data: createdBidder } = await query(
      'SELECT * FROM users WHERE user_id = ?',
      [bidderId]
    );

    console.log('Bidder created successfully:', createdBidder[0]);
    
    // Send email with credentials (wrapped in try-catch)
    try {
      const emailHTML = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #333;">Welcome to ProcuBid E-Auction System</h2>
  <p>Dear ${name},</p>
  <p>Your bidder account has been successfully created for <strong>${company}</strong>.</p>
  
  <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
    <h3 style="margin-top: 0;">Your Login Credentials:</h3>
    <p><strong>User ID:</strong> ${bidderId}</p>
    <p><strong>Password:</strong> ${password}</p>
  </div>
  
  <p>You can access the auction system at: 
    <a href="https://procubid.anunine.com/" target="_blank">https://procubid.anunine.com/</a>
  </p>
  
  <p><strong>🔑 Password Note:</strong><br>
  After logging in for the first time, you may create your own password through the system.  
  If you choose not to update, the above auto-generated password will remain valid.</p>
  
  <p>Thank you for joining our auction platform. We look forward to your active participation in upcoming auctions.</p>
  
  <br>
  <p>Best regards,<br>
  <strong>ProcuBid E-Auction System Team</strong></p>
  
  <hr style="margin: 20px 0;">
  <p style="font-size: 12px; color: #666;">
    This is an automated message. Please do not reply to this email.
  </p>
</div>
`;

      
      console.log('Attempting to send email to:', email);
      await sendEmail(email, 'E-Auction Account Created - Login Credentials', emailHTML);
      console.log('Email sent successfully');
    } catch (emailError) {
      console.error('Email failed to send:', emailError);
      // Don't fail the request if email fails
    }
    
    return res.json({
      success: true,
      message: 'Bidder registered successfully',
      bidder: createdBidder[0],
      temporaryPassword: process.env.NODE_ENV === 'development' ? password : undefined
    });
    
  } catch (error) {
    console.error('Error in registerBidder:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to register bidder',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getBidders = async (req, res) => {
  try {
    const { data, error } = await query(
      'SELECT * FROM users WHERE role = "bidder" ORDER BY created_at DESC'
    );

    if (error) throw error;
    
    res.json({ 
      success: true,
      bidders: data
    });
  } catch (error) {
    console.error('Error fetching bidders:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

const updateBidderStatus = async (req, res) => {
  try {
    const { bidderId } = req.params;
    const { is_active } = req.body;
    
    const { data, error } = await query(
      'UPDATE users SET is_active = ? WHERE user_id = ?',
      [is_active, bidderId]
    );
    
    if (error) throw error;
    
    // Get updated bidder
    const { data: updatedBidder } = await query(
      'SELECT * FROM users WHERE user_id = ?',
      [bidderId]
    );
    
    res.json({ success: true, bidder: updatedBidder[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const deactivateBidder = async (req, res) => {
  try {
    const { bidderId } = req.params;

    // First verify bidder exists and is active
    const { data: bidder, error: findError } = await query(
      'SELECT * FROM users WHERE user_id = ? AND deleted_at IS NULL',
      [bidderId]
    );

    if (findError || !bidder || bidder.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bidder not found or already deactivated'
      });
    }

    // Perform deactivation
    const { error } = await query(
      'UPDATE users SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE user_id = ?',
      [bidderId]
    );

    if (error) throw error;

    res.json({
      success: true,
      message: 'Bidder deactivated successfully',
      bidderId,
      deactivated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Deactivation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

const reactivateBidder = async (req, res) => {
  try {
    const { bidderId } = req.params;

    // Verify bidder exists and is deactivated
    const { data: bidder, error: findError } = await query(
      'SELECT * FROM users WHERE user_id = ? AND deleted_at IS NOT NULL',
      [bidderId]
    );

    if (findError || !bidder || bidder.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bidder not found or already active'
      });
    }

    // Perform reactivation
    const { error } = await query(
      'UPDATE users SET deleted_at = NULL, is_active = TRUE, updated_at = NOW() WHERE user_id = ?',
      [bidderId]
    );

    if (error) throw error;

    res.json({
      success: true,
      message: 'Bidder reactivated successfully',
      bidderId
    });

  } catch (error) {
    console.error('Reactivation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get active bidders for auction creation
const getActiveBidders = async (req, res) => {
  try {
    const { data, error } = await query(
      'SELECT * FROM users WHERE role = "bidder" AND is_active = TRUE AND deleted_at IS NULL ORDER BY created_at DESC'
    );

    if (error) throw error;
    
    res.json({ 
      success: true,
      bidders: data
    });
  } catch (error) {
    console.error('Error fetching active bidders:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

const testDbConnection = async (req, res) => {
  try {
    const { data, error } = await query('SELECT * FROM users LIMIT 1');
    
    if (error) throw error;
    
    res.json({
      success: true,
      connection: "Database connected successfully",
      data: data || "No data (table might be empty)"
    });
  } catch (error) {
    console.error("Database error details:", error);
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message
    });
  }
};

module.exports = {
  registerBidder,
  getBidders,
  updateBidderStatus,
  deactivateBidder,
  reactivateBidder,
  getActiveBidders,
  testDbConnection
};