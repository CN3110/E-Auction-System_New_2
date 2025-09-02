import React, { useState } from 'react';
import NavTabs from '../../Components/Common/NavTabs';
import AddBidder from './AddBidder';
import CreateAuction from './CreateAuction';
import ViewAuctions from './ViewAuctions';
import LiveRankings from './LiveRankings';
import '../../styles/admin.css';
import Footer from '../Common/Footer';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('viewAuctions');

  const tabs = [
    { id: 'viewAuctions', label: 'View Auctions' },
    { id: 'addBidder', label: 'Add New Bidder' },
    { id: 'createAuction', label: 'Create New Auction' },
    { id: 'liveRankings', label: 'Live Rankings' }
  ];

  return (
    <>
      <div className="admin-dashboard">
        <div className="dashboard-header">
          <NavTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
          
        </div>
        
        <div className="tab-content">
          {activeTab === 'viewAuctions' && <ViewAuctions />}
          {activeTab === 'addBidder' && <AddBidder />}
          {activeTab === 'createAuction' && <CreateAuction />}
          {activeTab === 'liveRankings' && <LiveRankings />}
        </div>
      </div>
      <Footer />
    </>
  );
};

export default AdminDashboard;