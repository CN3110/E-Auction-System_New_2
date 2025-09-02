import React from 'react';
import '../../styles/common.css';
import { logout } from '../../services/authService';

// Zoom-style leave/logout icon
const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16,17 21,12 16,7"/>
    <line x1="21" x2="9" y1="12" y2="12"/>
  </svg>
);

const NavTabs = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div className="nav-tabs-header">
      <div className="logo-wrapper">
        <img src="/Assets/Anunine-Logo.png" alt="Org Logo" className="org-logo" />
      </div>
      
      <div className="nav-tabs-container">
        <div className="nav-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="logout-section">
          <button onClick={logout} className="logout-btn" title="Logout">
            <LogoutIcon />
            
          </button>
        </div>
      </div>
    </div>
  );
};

export default NavTabs;