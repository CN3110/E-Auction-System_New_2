import React, { useState } from 'react';
import NavTabs from '../Common/NavTabs';
import LiveAuction from './LiveAuction';
import AuctionHistory from './AuctionHistory';
import '../../styles/bidder.css';
import Footer from '../Common/Footer';
import { logout } from '../../services/authService'; // Import from authService

const BidderDashboard = () => {
  const [activeTab, setActiveTab] = useState('liveAuction');
  
  const userData = JSON.parse(localStorage.getItem('user'));
  const userName = userData?.name || 'Bidder';
  const userId = userData?.user_id || '';

  const tabs = [
    { id: 'liveAuction', label: 'Live Auction' },
    { id: 'auctionHistory', label: 'Auction History' }
  ];

  return (
    <>
      <div className="bidder-dashboard">
        <div className="dashboard-header">
          <NavTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
          
        </div>
        
        <br />
        <div className="user-info">
          <h3>Welcome, {userName}</h3>
          {userId && <p>User ID: {userId}</p>}
        </div>
        
        <div className="tab-content">
          {activeTab === 'liveAuction' && <LiveAuction />}
          {activeTab === 'auctionHistory' && <AuctionHistory />}
        </div>
      </div>
      <Footer />
    </>
  );
};

export default BidderDashboard;