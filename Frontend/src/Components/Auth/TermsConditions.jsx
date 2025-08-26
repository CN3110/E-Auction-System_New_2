// components/TermsAndConditions.jsx
import React, { useState } from 'react';
//import '../../styles/terms.css';

const TermsAndConditions = () => {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="terms-container">
      <h2>E-Auction System Terms and Conditions</h2>
      
      <div className="terms-content">
        <h3>1. Introduction</h3>
        <p>
          Welcome to the Anunine Holdings Pvt Ltd E-Auction System. These Terms and Conditions govern your participation 
          in our reverse auction platform. By accessing or using our system, you agree to be bound by these terms.
        </p>

        <h3>2. Reverse Auction Process</h3>
        <p>
          Our platform operates as a reverse auction system where suppliers compete to offer the lowest price for 
          goods or services. The auction process follows these steps:
        </p>
        <ul>
          <li>Only account created by the admin, and invited bidders may participate in auctions</li>
          <li>Bidders submit decreasing bids during the auction period</li>
          <li>Real-time ranking is displayed but is not final</li>
          <li>Admin reserves the right to disqualify any bidder for valid reasons</li>
          <li>The bidder with the lowest qualified bid will be awarded the contract</li>
        </ul>

        <h3>3. Bidder Responsibilities</h3>
        <p>
          As a bidder, you agree to:
        </p>
        <ul>
          
          <li>Maintain the confidentiality of your emailed login credentials</li>
          <li>Submit bids in good faith with intention to honor if awarded</li>
          <li>as the rankings update every 10 minutes, you have to make sure do not bidding when the rest of time is 10s.</li>
          <li>Comply with all applicable laws and regulations</li>
          <li>after shortlisted you have to submit relavant documents, and then the adminstarion deside the final result.</li>
          <li>Not engage in collusion or anti-competitive behavior</li>
        </ul>

        <h3>4. Admin Rights and Disqualification</h3>
        <p>
          The auction administrator reserves the right to:
        </p>
        <ul>
          <li>Disqualify any bidder for valid reasons including but not limited to:
            <ul>
              <li>Suspected collusion or price fixing</li>
              <li>Technical non-compliance with specifications</li>
              <li>Inability to meet delivery requirements</li>
              <li>Submission of fraudulent documentation</li>
              <li>Violation of these terms and conditions</li>
            </ul>
          </li>
          <li>Cancel an auction at any stage, even after completion</li>
          <li>Make final determination of the winning bidder</li>
          <li>Modify auction parameters as necessary</li>
        </ul>

        <h3>5. Auction Cancellation</h3>
        <p>
          The production team, management, or authorized senior personnel reserve the right to cancel any auction, 
          even after completion, due to:
        </p>
        <ul>
          <li>Changes in business requirements</li>
          <li>Budgetary constraints</li>
          <li>Technical errors in the auction process</li>
          <li>Suspected fraudulent activity</li>
          <li>Force majeure events</li>
        </ul>

        <h3>6. Liability Limitations</h3>
        <p>
          Anunine Holdings Pvt Ltd shall not be liable for:
        </p>
        <ul>
          <li>Technical failures or interruptions in service</li>
          <li>Bidder errors in submitting bids</li>
          <li>Financial losses resulting from auction participation</li>
          <li>Decisions to disqualify or not award a contract</li>
          <li>Auction cancellations</li>
        </ul>

        <h3>7. Governing Law</h3>
        <p>
          These terms shall be governed by and construed in accordance with the laws of the jurisdiction where 
          Anunine Holdings Pvt Ltd is registered.
        </p>

        
      </div>
    </div>
  );
};

export default TermsAndConditions;