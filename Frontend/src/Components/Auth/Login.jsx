import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '../Common/Alert';
import Footer from '../Common/Footer';
import '../../styles/auth.css';

const Login = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({
    userId: '',
    password: ''
  });
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
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

      // Debug log to check user data
      console.log('Login successful. User data:', data.user);
      console.log('User role:', data.user.role);

      // Call onLogin callback if provided
      if (onLogin) {
        onLogin(data.user);
      }

      // Redirect based on role - Fixed to handle system_admin correctly
      if (data.user.role === 'admin' || data.user.role === 'system_admin') {
        navigate('/admindashboard');
      } else if (data.user.role === 'bidder') {
        navigate('/bidderdashboard');
      } else {
        throw new Error(`Unknown user role: ${data.user.role}`);
      }

      // Show success message with role information
      setAlert({
        show: true,
        message: `Welcome ${data.user.name}!) Redirecting...`,
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
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isLoading}
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
    </>
  );
};

export default Login;