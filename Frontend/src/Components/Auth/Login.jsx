// Login.jsx (updated)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '../Common/Alert';
import Footer from '../Common/Footer';
import '../../styles/auth.css';
import TermsConditions from './TermsConditions';

const Login = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({
    userId: '',
    password: ''
  });
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const navigate = useNavigate();

  // Check if user has already accepted terms
  useEffect(() => {
    const hasAcceptedTerms = localStorage.getItem('termsAccepted');
    if (hasAcceptedTerms) {
      setTermsAccepted(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Check if terms are accepted (if not already accepted previously)
    if (!termsAccepted && !localStorage.getItem('termsAccepted')) {
      setAlert({
        show: true,
        message: 'Please accept the Terms and Conditions to proceed',
        type: 'error'
      });
      return;
    }

    setIsLoading(true);
    setAlert({ show: false, message: '', type: '' });

    try {
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: credentials.userId,
          password: credentials.password
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Login failed');
      }

      // Store token and user data
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // Store terms acceptance if just accepted
      if (termsAccepted && !localStorage.getItem('termsAccepted')) {
        localStorage.setItem('termsAccepted', 'true');
      }

      // Call onLogin callback if provided
      if (onLogin) {
        onLogin(data.user);
      }

      // Redirect based on role
      if (data.user.role === 'admin' || data.user.role === 'system_admin') {
        navigate('/admindashboard');
      } else if (data.user.role === 'bidder') {
        navigate('/bidderdashboard');
      } else {
        throw new Error(`Unknown user role: ${data.user.role}`);
      }

      setAlert({
        show: true,
        message: `Welcome ${data.user.name}! Redirecting...`,
        type: 'success'
      });

    } catch (error) {
      console.error('Login error:', error);
      setAlert({
        show: true,
        message: error.message,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setCredentials(prev => ({
      ...prev,
      [field]: field === 'userId' ? value.toUpperCase() : value
    }));
  };

  const viewTerms = () => {
    setShowTerms(true);
  };

  const closeTerms = () => {
    setShowTerms(false);
  };

  return (
    <>
      <div className="login-page">
        <div className="login-form">
          <h2>
            Login to <br /> E-Auction System
            <br /> Anunine Holdings Pvt Ltd
          </h2>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>User ID</label>
              <input 
                type="text" 
                value={credentials.userId}
                onChange={(e) => handleInputChange('userId', e.target.value)}
                placeholder="Enter your User ID" 
                required 
                maxLength={10}
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input 
                type="password" 
                value={credentials.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                placeholder="Enter your password" 
                required 
              />
            </div>
            
          {!localStorage.getItem('termsAccepted') && (
  <div className="terms-checkbox">
    <label>
      <input 
        type="checkbox" 
        checked={termsAccepted}
        onChange={() => setTermsAccepted(!termsAccepted)}
      />
      I agree to the <span className="terms-link" onClick={viewTerms}>Terms and Conditions</span>
    </label>
  </div>
)}
            
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isLoading || (!termsAccepted && !localStorage.getItem('termsAccepted'))}
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>
          
          {alert.show && (
            <Alert 
              message={alert.message} 
              type={alert.type}
              onClose={() => setAlert({ show: false, message: '', type: '' })}
            />
          )}
        </div>
        <Footer />
      </div>

      {/* Terms and Conditions Modal */}
      {showTerms && (
        <div className="modal-overlay">
          <div className="modal-content terms-modal">
            <div className="modal-header">
              <h3>Terms and Conditions</h3>
              <button className="close-button" onClick={closeTerms}>×</button>
            </div>
            <div className="modal-body">
              <TermsConditions />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeTerms}>
                Close
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  setTermsAccepted(true);
                  closeTerms();
                }}
              >
                Accept Terms
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Login;