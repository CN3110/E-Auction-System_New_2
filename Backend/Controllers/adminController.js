const { supabaseAdmin } = require('../Config/database');
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
    const { data: existingUser, error: existingUserError } = await supabaseAdmin
      .from('users')
      .select('user_id')
      .eq('email', email)
      .maybeSingle();

    if (existingUserError) throw existingUserError;
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        error: 'Email already registered' 
      });
    }

    // Get last bidder ID - more robust query
    const { data: lastBidder, error: lastBidderError } = await supabaseAdmin
      .from('users')
      .select('user_id')
      .ilike('user_id', 'B%') // Only get bidder IDs (starting with B)
      .order('user_id', { ascending: false })
      .limit(1);
    
    if (lastBidderError) throw lastBidderError;
    
    // Handle case where no bidders exist yet
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

    // Insert new bidder with transaction for safety
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert([{
        user_id: bidderId,
        email,
        password_hash: hashedPassword,
        role: 'bidder',
        name,
        company,
        phone: phone || null,
        is_active: true
      }])
      .select();
    
    if (error) {
      console.error('Supabase insert error:', error);
      // Handle specific constraint violation
      if (error.code === '23505') {
        return res.status(409).json({ 
          success: false, 
          error: 'Bidder ID already exists. Please try again.' 
        });
      }
      throw error;
    }

    console.log('Bidder created successfully:', data[0]);
    
    // Send email with credentials (wrapped in try-catch)
    try {
      const emailHTML = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to E-Auction System</h2>
          <p>Dear ${name},</p>
          <p>Your bidder account has been created successfully for <strong>${company}</strong>.</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Your Login Credentials:</h3>
            <p><strong>User ID:</strong> ${bidderId}</p>
            <p><strong>Password:</strong> ${password}</p>
          </div>
          
          <p>Thank you for joining our auction platform!</p>
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
      bidder: data[0],
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
    // Use supabaseAdmin (the properly imported client)
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('role', 'bidder')
      .order('created_at', { ascending: false });

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
    
    const { data, error } = await supabase
      .from('users')
      .update({ is_active })
      .eq('user_id', bidderId)
      .select();
    
    if (error) throw error;
    
    res.json({ success: true, bidder: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const deactivateBidder = async (req, res) => {
  try {
    const { bidderId } = req.params;

    // First verify bidder exists and is active
    const { data: bidder, error: findError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('user_id', bidderId)
      .is('deleted_at', null)
      .single();

    if (findError || !bidder) {
      return res.status(404).json({
        success: false,
        error: 'Bidder not found or already deactivated'
      });
    }

    // Perform deactivation
    const { error } = await supabaseAdmin
      .from('users')
      .update({
        deleted_at: new Date().toISOString(),
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', bidderId);

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
    const { data: bidder, error: findError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('user_id', bidderId)
      .not('deleted_at', 'is', null)
      .single();

    if (findError || !bidder) {
      return res.status(404).json({
        success: false,
        error: 'Bidder not found or already active'
      });
    }

    // Perform reactivation
    const { error } = await supabaseAdmin
      .from('users')
      .update({
        deleted_at: null,
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', bidderId);

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

// Get active bidders for auction creation - when selecting only active bidders
const getActiveBidders = async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('role', 'bidder')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

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
    // Test with a simple query
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .limit(1);
    
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