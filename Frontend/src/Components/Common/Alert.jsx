import React, { useEffect } from 'react';
import '../../styles/common.css';

const Alert = ({ message, type }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      // Auto-hide after 3 seconds
    }, 3000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div className={`alert alert-${type}`}>
      {message}
    </div>
  );
};

export default Alert;