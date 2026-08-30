
import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

export const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Link to="/" className="brand-logo">
              {/* <div className="logo-icon">NOVA</div> */}
              <span className="brand-name"><img src="https://i.ibb.co/GQK71PS1/novacore.png" width="30" height="30" alt="NOVA" /> $NOVA — Meme Power. Core Utilities</span>
            </Link>
            <p className="footer-desc">
              The revolutionary token built on Solana blockchain. Join millions of users building the future of Web3 and DeFi.
            </p>
          </div>

          <div className="footer-grid">
            <div className="footer-column">
              <h4>Platform</h4>
              <ul>
                <li><a href="#airdrop">Airdrop</a></li>
                <li><a href="#trading">Trading</a></li>
                <li><a href="#staking">Staking</a></li>
                <li><a href="#analytics">Analytics</a></li>
              </ul>
            </div>

            <div className="footer-column">
              <h4>Resources</h4>
              <ul>
                <li><a href="#docs">Documentation</a></li>
                <li><a href="#whitepaper">Whitepaper</a></li>
                <li><a href="#roadmap">Roadmap</a></li>
                <li><a href="#tokenomics">Tokenomics</a></li>
              </ul>
            </div>

            <div className="footer-column">
              <h4>Legal</h4>
              <ul>
                <li><a href="#privacy">Privacy Policy</a></li>
                <li><a href="#terms">Terms of Service</a></li>
                <li><a href="#cookies">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} <img src="https://i.ibb.co/GQK71PS1/novacore.png" width="20" height="20" alt="NOVA" /> $NOVA — Meme Power. Core Utilities. All rights reserved.</p>
          <div className="footer-stats">
            <span><strong>$2.5M</strong> Total Volume</span>
            <span><strong>150K+</strong> Active Users</span>
          </div>
        </div>
      </div>
    </footer>
  );
};