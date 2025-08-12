import React, { useState } from 'react';
import NavTabs from '../../Components/Common/NavTabs';
import AddBidder from './AddBidder';
import CreateAuction from './CreateAuction';
import LiveRankings from './LiveRankings';
import '../../styles/admin.css';
import Footer from '../Common/Footer';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('addBidder');

  const tabs = [
    { id: 'addBidder', label: 'Add New Bidder' },
    { id: 'createAuction', label: 'Create New Auction' },
    { id: 'liveRankings', label: 'Live Rankings' }
  ];

  return (
     <>
    <div className="admin-dashboard">
     
      <NavTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="tab-content">
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