import React from 'react';
import '../../styles/footer.css';

const Footer = () => {
  const logos = [
    '/Assets/KSPA Packaging (1).png',
    '/Assets/Ethimale_sugar_RGB_Logo.png',
    '/Assets/KSPA Accessories (1).png',
    '/Assets/ATIRE (1).png',
    '/Assets/RECYplas.png',
    '/Assets/Ep.png',
    '/Assets/IHT-Logo.png',
    '/Assets/RECY-Traders.png',
    '/Assets/KSPA_Paper_RGB_Logo.png',
    
  ];

  return (
    <footer className="footer">
      <div className="logo-grid">
        {logos.map((logo, index) => (
          <div className="logo-item" key={index}>
            <img src={logo} alt={`Logo ${index + 1}`} />
          </div>
        ))}
      </div>
      <p className="footer-copy">
        ©2025 All rights reserved, Anunine Holdings Private Limited.
      </p>
    </footer>
  );
};

export default Footer;
