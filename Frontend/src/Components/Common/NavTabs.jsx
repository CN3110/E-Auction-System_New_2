import React from 'react';
import '../../styles/common.css';

const NavTabs = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div className="nav-tabs-header">
      <div className="logo-wrapper">
        <img src="/Assets/Anunine-Logo.png" alt="Org Logo" className="org-logo" />
      </div>
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
    </div>
  );
};

export default NavTabs;
