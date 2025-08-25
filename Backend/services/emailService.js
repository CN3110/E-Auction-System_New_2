// services/emailService.js
const nodemailer = require('nodemailer');

// Configure your email transporter (update with your SMTP settings)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Email templates
const emailTemplates = {
  shortlist: {
    subject: '🎉 Congratulations! You\'ve been shortlisted for {auctionId}',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
          <h1>🎉 Congratulations!</h1>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p>Dear {bidderName},</p>
          
          <p>We are pleased to inform you that you have been <strong>shortlisted</strong> for the auction:</p>
          
          <div style="background-color: white; padding: 15px; border-left: 4px solid #4CAF50; margin: 15px 0;">
            <p><strong>Auction ID:</strong> {auctionId}</p>
            <p><strong>Title:</strong> {auctionTitle}</p>
            <p><strong>Your Bid Amount:</strong> LKR {bidAmount}</p>
          </div>
          
          <h3>Next Steps:</h3>
          <ul>
            <li>Please prepare your detailed quotation</li>
            <li>Include all product specifications and terms</li>
            <li>Submit any additional documentation as required</li>
            <li>Our team will contact you with further instructions</li>
          </ul>
          
          <p>This is an important step forward in the auction process. Please ensure all required documents are ready for submission.</p>
          
          <p>Best regards,<br>
          E-Auction System Team</p>
        </div>
        <div style="background-color: #333; color: white; padding: 10px; text-align: center; font-size: 12px;">
          This is an automated message. Please do not reply to this email.
        </div>
      </div>
    `
  },
  
  disqualification: {
    subject: 'Auction Update: Disqualification Notice for {auctionId}',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f44336; color: white; padding: 20px; text-align: center;">
          <h1>⚠️ Disqualification Notice</h1>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p>Dear {bidderName},</p>
          
          <p>We regret to inform you that you have been disqualified from the auction:</p>
          
          <div style="background-color: white; padding: 15px; border-left: 4px solid #f44336; margin: 15px 0;">
            <p><strong>Auction ID:</strong> {auctionId}</p>
            <p><strong>Title:</strong> {auctionTitle}</p>
          </div>
          
          <div style="background-color: #ffebee; padding: 15px; border: 1px solid #f44336; margin: 15px 0;">
            <h4 style="margin-top: 0; color: #f44336;">Reason for Disqualification:</h4>
            <p>{reason}</p>
          </div>
          
          <p>If you have any questions or believe this decision was made in error, please contact our support team.</p>
          
          <p>Thank you for your participation.</p>
          
          <p>Best regards,<br>
          E-Auction System Team</p>
        </div>
        <div style="background-color: #333; color: white; padding: 10px; text-align: center; font-size: 12px;">
          This is an automated message. Please do not reply to this email.
        </div>
      </div>
    `
  },
  
  cancellation: {
    subject: 'Auction Cancelled: {auctionId}',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #ff9800; color: white; padding: 20px; text-align: center;">
          <h1>🚫 Auction Cancelled</h1>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p>Dear {bidderName},</p>
          
          <p>We regret to inform you that the following auction has been cancelled:</p>
          
          <div style="background-color: white; padding: 15px; border-left: 4px solid #ff9800; margin: 15px 0;">
            <p><strong>Auction ID:</strong> {auctionId}</p>
            <p><strong>Title:</strong> {auctionTitle}</p>
          </div>
          
          <div style="background-color: #fff3e0; padding: 15px; border: 1px solid #ff9800; margin: 15px 0;">
            <h4 style="margin-top: 0; color: #ff9800;">Reason for Cancellation:</h4>
            <p>{reason}</p>
          </div>
          
          <p>All bids for this auction are now void. If you have any questions, please contact our support team.</p>
          
          <p>We apologize for any inconvenience caused and thank you for your understanding.</p>
          
          <p>Best regards,<br>
          E-Auction System Team</p>
        </div>
        <div style="background-color: #333; color: white; padding: 10px; text-align: center; font-size: 12px;">
          This is an automated message. Please do not reply to this email.
        </div>
      </div>
    `
  },
  
  award: {
    subject: '🏆 Congratulations! You awarded the auction {auctionId}',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
          <h1>🏆 Congratulations!</h1>
          <h2>You Won the Auction!</h2>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p>Dear {bidderName},</p>
          
          <p>We are delighted to inform you that you have been <strong>awarded</strong> the auction:</p>
          
          <div style="background-color: white; padding: 15px; border-left: 4px solid #4CAF50; margin: 15px 0;">
            <p><strong>Auction ID:</strong> {auctionId}</p>
            <p><strong>Title:</strong> {auctionTitle}</p>
          </div>
          
          <div style="background-color: #e8f5e8; padding: 15px; border: 1px solid #4CAF50; margin: 15px 0;">
            <h4 style="margin-top: 0; color: #4CAF50;">Next Steps:</h4>
            <ul>
              <li>Our procurement team will contact you within 2 business days</li>
              <li>Please prepare all necessary documentation</li>
              <li>Contract finalization will begin shortly</li>
              <li>Ensure you have all required licenses and certifications ready</li>
            </ul>
          </div>
          
          <p>Thank you for your participation and congratulations once again on winning this auction!</p>
          
          <p>Best regards,<br>
          E-Auction System Team</p>
        </div>
        <div style="background-color: #333; color: white; padding: 10px; text-align: center; font-size: 12px;">
          This is an automated message. Please do not reply to this email.
        </div>
      </div>
    `
  }
};

// Helper function to replace placeholders in templates
const replacePlaceholders = (template, data) => {
  let result = template;
  Object.keys(data).forEach(key => {
    const placeholder = `{${key}}`;
    result = result.replace(new RegExp(placeholder, 'g'), data[key] || '');
  });
  return result;
};

// Send shortlist email
const sendShortlistEmail = async (data) => {
  try {
    const { to, bidderName, auctionId, auctionTitle, bidAmount } = data;
    
    const emailData = {
      bidderName,
      auctionId,
      auctionTitle,
      bidAmount: new Intl.NumberFormat('en-LK', {
        style: 'currency',
        currency: 'LKR'
      }).format(bidAmount)
    };
    
    const subject = replacePlaceholders(emailTemplates.shortlist.subject, emailData);
    const html = replacePlaceholders(emailTemplates.shortlist.html, emailData);
    
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@eauction.com',
      to,
      subject,
      html
    });
    
    console.log(`Shortlist email sent to ${to}`);
  } catch (error) {
    console.error('Error sending shortlist email:', error);
    throw error;
  }
};

// Send disqualification email
const sendDisqualificationEmail = async (data) => {
  try {
    const { to, bidderName, auctionId, auctionTitle, reason } = data;
    
    const emailData = {
      bidderName,
      auctionId,
      auctionTitle,
      reason
    };
    
    const subject = replacePlaceholders(emailTemplates.disqualification.subject, emailData);
    const html = replacePlaceholders(emailTemplates.disqualification.html, emailData);
    
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@eauction.com',
      to,
      subject,
      html
    });
    
    console.log(`Disqualification email sent to ${to}`);
  } catch (error) {
    console.error('Error sending disqualification email:', error);
    throw error;
  }
};

// Send cancellation email
const sendCancellationEmail = async (data) => {
  try {
    const { to, bidderName, auctionId, auctionTitle, reason } = data;
    
    const emailData = {
      bidderName,
      auctionId,
      auctionTitle,
      reason
    };
    
    const subject = replacePlaceholders(emailTemplates.cancellation.subject, emailData);
    const html = replacePlaceholders(emailTemplates.cancellation.html, emailData);
    
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@eauction.com',
      to,
      subject,
      html
    });
    
    console.log(`Cancellation email sent to ${to}`);
  } catch (error) {
    console.error('Error sending cancellation email:', error);
    throw error;
  }
};

// Send award email
const sendAwardEmail = async (data) => {
  try {
    const { to, bidderName, auctionId, auctionTitle } = data;
    
    const emailData = {
      bidderName,
      auctionId,
      auctionTitle
    };
    
    const subject = replacePlaceholders(emailTemplates.award.subject, emailData);
    const html = replacePlaceholders(emailTemplates.award.html, emailData);
    
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@eauction.com',
      to,
      subject,
      html
    });
    
    console.log(`Award email sent to ${to}`);
  } catch (error) {
    console.error('Error sending award email:', error);
    throw error;
  }
};

// Test email configuration
const testEmailConfig = async () => {
  try {
    await transporter.verify();
    console.log('Email configuration is valid');
    return true;
  } catch (error) {
    console.error('Email configuration error:', error);
    return false;
  }
};

module.exports = {
  sendShortlistEmail,
  sendDisqualificationEmail,
  sendCancellationEmail,
  sendAwardEmail,
  testEmailConfig
};