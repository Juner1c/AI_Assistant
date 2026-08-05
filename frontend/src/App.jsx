import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

// Automatically detect host machine IP or custom environment URL for group mates
const getDefaultBackendUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:8000';
  return 'https://ai-assistant-b02f.onrender.com';
};

function App() {
  const [backendUrl, setBackendUrl] = useState(() => {
    const saved = localStorage.getItem('mindspark_backend_url');
    if (window.location.protocol === 'https:' && saved && saved.startsWith('http:')) {
      localStorage.setItem('mindspark_backend_url', getDefaultBackendUrl());
      return getDefaultBackendUrl();
    }
    return saved || getDefaultBackendUrl();
  });
  const [serverStatus, setServerStatus] = useState('checking');

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [loadingScan, setLoadingScan] = useState(false);

  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat', 'about', 'features', 'how-it-works'

  const fileInputRef = useRef(null);
  const chatInputRef = useRef(null);

  useEffect(() => {
    let timer;
    let active = true;

    const ping = async () => {
      if (!active) return;
      setServerStatus((prev) => (prev === 'online' ? 'online' : 'checking'));
      try {
        const res = await axios.get(`${backendUrl}/api/health`, { timeout: 15000 });
        if (active && res.data && res.data.status === 'ok') {
          setServerStatus('online');
        } else if (active) {
          setServerStatus('offline');
          timer = setTimeout(ping, 6000);
        }
      } catch (err) {
        if (active) {
          setServerStatus('offline');
          timer = setTimeout(ping, 6000);
        }
      }
    };

    ping();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [backendUrl]);

  const updateBackendUrl = (newUrl) => {
    const formatted = newUrl.trim().replace(/\/+$/, '');
    setBackendUrl(formatted);
    localStorage.setItem('mindspark_backend_url', formatted);
    showToast(`🌐 Backend URL updated to ${formatted}`);
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleImageChange = (e) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setScanResult(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setScanResult(null);
    }
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const focusChatInput = () => {
    if (chatInputRef.current) {
      chatInputRef.current.focus();
    }
  };

  const handleScan = async () => {
    if (!selectedFile) return;
    setLoadingScan(true);
    setLoadingChat(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post(`${backendUrl}/api/scan-image`, formData);
      const data = response.data;
      setScanResult(data);
      showToast("✅ Image scan complete!");

      try {
        const isFake = data.is_ai_generated;
        const confidencePct = Math.round((data.confidence || 0) * 100);

        const chatFormData = new URLSearchParams();
        chatFormData.append('user_message', `Summarize the image analysis result and give me safety advice. The image is ${isFake ? 'AI Generated Fake' : 'Real Photograph'} with ${confidencePct}% confidence.`);
        chatFormData.append('is_fake', isFake);
        chatFormData.append('scan_details', JSON.stringify({
          is_ai_generated: isFake,
          confidence: confidencePct,
          model_used: data.model_used || 'Sightengine Forensic Engine',
          flags: data.flags || []
        }));

        const chatResponse = await axios.post(`${backendUrl}/api/chat`, chatFormData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const aiAdvice = chatResponse.data.ai_response;
        setMessages((prev) => [
          ...prev,
          { sender: 'ai', text: aiAdvice }
        ]);
      } catch (chatErr) {
        console.error("Auto AI assistance failed:", chatErr);
      }
    } catch (err) {
      console.error(err);
      showToast("⚠️ Could not connect to backend server. Please verify backend URL.");
      setScanResult({
        is_ai_generated: false,
        confidence: 0,
        summary: "⚠️ Backend API Offline: Unable to reach the Python FastAPI analysis server.",
        model_used: "Offline / Disconnected",
        flags: ["Backend server connection error"],
        web_context: null
      });
    } finally {
      setLoadingScan(false);
      setLoadingChat(false);
    }
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMsg = inputMessage;
    setInputMessage('');
    
    const currentHistory = messages.slice(-6).map(m => ({ sender: m.sender, text: m.text }));
    
    setMessages((prev) => [...prev, { sender: 'user', text: userMsg }]);

    setLoadingChat(true);
    const isFake = scanResult ? scanResult.is_ai_generated : false;

    const formData = new URLSearchParams();
    formData.append('user_message', userMsg);
    formData.append('is_fake', isFake);
    formData.append('chat_history', JSON.stringify(currentHistory));
    if (scanResult) {
      formData.append('scan_details', JSON.stringify({
        is_ai_generated: scanResult.is_ai_generated,
        confidence: Math.round((scanResult.confidence || 0) * 100),
        model_used: scanResult.model_used,
        flags: scanResult.flags || []
      }));
    }

    try {
      const response = await axios.post(`${backendUrl}/api/chat`, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const aiReply = response.data.ai_response;
      const scrubbed = response.data.scrubbed_message_sent_to_cloud;

      setMessages((prev) => [
        ...prev,
        { sender: 'ai', text: aiReply, scrubbed: scrubbed }
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, { sender: 'ai', text: 'System error connecting to AI.' }]);
    } finally {
      setLoadingChat(false);
    }
  };

  const handleReverseSearch = (engine) => {
    if (scanResult && scanResult.web_context) {
      let targetUrl = scanResult.web_context.google_lens_url;
      if (engine === 'tineye') targetUrl = scanResult.web_context.tineye_url;
      window.open(targetUrl, '_blank');
    }
  };

  return (
    <div className="dashboard-layout-wrapper">
      {/* Toast Popup Notification */}
      {toastMessage && <div className="app-toast-popup">{toastMessage}</div>}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        id="file-upload-hidden"
        type="file"
        accept="image/*"
        onChange={handleImageChange}
        style={{ display: 'none' }}
      />

      {/* Main Dashboard Container */}
      <div className="dashboard-container">
        
        {/* LEFT SIDEBAR NAVIGATION */}
        <aside className="sidebar">
          {/* Brand Header */}
          <div className="sidebar-brand" onClick={() => setActiveModal('about')}>
            <div className="brand-logo-box">K</div>
            <div className="brand-title-wrap">
              <span className="brand-title">mai-Assistant</span>
            </div>
          </div>

          {/* Search Box */}
          <div className="sidebar-search-box" onClick={focusChatInput}>
            <span className="search-icon">🔍</span>
            <span className="search-placeholder">Search</span>
            <span className="search-badge">⌘P</span>
          </div>

          {/* Navigation Group 1: MAIN NAVIGATION */}
          <div className="nav-group">
            <span className="nav-group-title">MAIN NAVIGATION</span>
            <button className={`sidebar-nav-item ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
              <span className="nav-icon">💬</span> mai-Assistant Chat
            </button>
            <button className="sidebar-nav-item" onClick={() => setActiveModal('about')}>
              <span className="nav-icon">🛡️</span> About
            </button>
            <button className="sidebar-nav-item" onClick={() => setActiveModal('features')}>
              <span className="nav-icon">⚡</span> Feature
            </button>
            <button className="sidebar-nav-item" onClick={() => setActiveModal('how-it-works')}>
              <span className="nav-icon">⚙️</span> How It Works
            </button>
            <button className="sidebar-nav-item" onClick={() => setActiveModal('extension')}>
              <span className="nav-icon">🧩</span> Add to Chrome
            </button>
          </div>

          {/* Navigation Group 2: OPTIMIZATION & TOOLS */}
          <div className="nav-group">
            <span className="nav-group-title">OPTIMIZATION & TOOLS</span>
            <button className="sidebar-nav-item" onClick={() => setActiveModal('blog')}>
              <span className="nav-icon">📰</span> Blog Articles <span className="nav-badge-count">23</span>
            </button>
            <button className="sidebar-nav-item" onClick={() => setActiveModal('server')}>
              <span className="nav-icon">🌐</span> Server Status
              <span className={`sidebar-status-dot status-${serverStatus}`}></span>
            </button>
          </div>

          {/* Sidebar Bottom Banner & Profile Card */}
          <div className="sidebar-bottom-section">
            <div className="sidebar-promo-card">
              <div className="promo-logo">K</div>
              <div className="promo-title">mai-assistant Pro</div>
              <div className="promo-sub">Trust & Safety, Deepfake Detection & Privacy</div>
              <button className="btn-promo-action" onClick={() => setActiveModal('features')}>Explore Features</button>
            </div>

            <div className="sidebar-profile-card">
              <div className="profile-avatar">🛡️</div>
              <div className="profile-info">
                <span className="profile-name">mai-assistant</span>
                <span className="profile-email">v1.0 Safety Engine</span>
              </div>
            </div>
          </div>
        </aside>

        {/* RIGHT MAIN PANEL WORKSPACE */}
        <main className="main-panel">
          
          {/* Top Panel Header Bar */}
          <header className="main-header">
            <div className="header-left">
              <div className="dropdown-selector" onClick={() => setActiveModal('about')}>
                <span className="dropdown-logo">K</span>
                <span className="dropdown-text">mai-Assistant</span>
                <span className="dropdown-arrow">▾</span>
              </div>
            </div>

            <div className="header-right">
              <div className="header-search-bar" onClick={focusChatInput}>
                <span className="search-icon">🔍</span>
                <span className="search-placeholder">Search</span>
                <span className="search-badge">⌘P</span>
              </div>

              <button className="btn-new-chat" onClick={triggerFileInput}>
                + New Scan
              </button>

              <div className="header-icon-buttons">
                <button className="header-icon-btn" title="Backend Server Config" onClick={() => setActiveModal('server')}>⚙</button>
                <button className="header-icon-btn" title="Blog Updates" onClick={() => setActiveModal('blog')}>🔔</button>
                <button className="header-icon-btn" title="Add to Chrome" onClick={() => setActiveModal('extension')}>↗ Share</button>
              </div>
            </div>
          </header>

          {/* Main Hero Workspace Area */}
          <div className="workspace-content">
            
            {/* Center Logo Graphic */}
            <div className="center-logo-glow">
              <div className="logo-badge-icon">K</div>
            </div>

            {/* Hero Titles */}
            <h1 className="main-hero-title">
              See Through the Deception<br />
              <span className="hero-highlight">How Can I <span className="highlight-text">Assist You Today?</span></span>
            </h1>

            <p className="main-hero-subtitle">
              Scan Image. Uncover Its Origin. Stay Safe Online.
            </p>

            {/* Main Interactive Card Workspace Container */}
            <div className="central-card-wrapper">
              <div
                className={`mindspark-main-card ${isDragging ? 'drag-active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Top Welcome / Chat Assistant Section */}
                <div className="welcome-chat-bubble">
                  Thank you for reaching out! As mai-assistant, I am specifically designed to focus on Trust & Safety, Deepfake Detection, and Scam Prevention.<br /><br />
                  I am here to help you:<br />
                  1. Analyze uploaded images for deepfakes and AI synthetic manipulation<br />
                  2. Evaluate suspicious messages or investment offers for scam risks<br />
                  3. Learn about digital privacy and local PII masking<br /><br />
                  Please let me know if you have a question about online safety, or upload an image or message for me to verify!
                </div>

                <div className="card-top-tag">
                  ✦ Initiate a query or send a command to mai-assistant...
                </div>

                {/* Uploaded File Banner / Selected Image Bar / Dropzone */}
                {selectedFile ? (
                  <div className="file-preview-card">
                    <div className="file-preview-left">
                      {previewUrl && <img src={previewUrl} alt="Upload preview" className="file-thumb" />}
                      <div className="file-meta">
                        <span className="file-name">{selectedFile.name}</span>
                        <span className="file-status">
                          {scanResult ? '✅ Scan Completed' : 'Ready for Sightengine Forensic Scan'}
                        </span>
                      </div>
                    </div>

                    {!scanResult && (
                      <button onClick={handleScan} disabled={loadingScan} className="btn-scan-pill">
                        {loadingScan ? 'Scanning...' : 'Scan Image'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="empty-drop-hint" onClick={triggerFileInput}>
                    Drag and Drop an <strong>image</strong> here or click <strong>Upload Image</strong> below
                  </div>
                )}

                {/* Notification / Scan Result Container */}
                {scanResult && (
                  <div className={`scan-notification-banner ${scanResult.is_ai_generated ? 'result-fake' : 'result-real'}`}>
                    <div className="notification-header">
                      <span className="notification-icon">{scanResult.is_ai_generated ? '⚠️' : '✅'}</span>
                      <div>
                        <strong>AI Detection Status:</strong> {scanResult.is_ai_generated ? 'Synthetic / AI Generated' : 'Real Photograph'}
                        <span className="confidence-tag">({(scanResult.confidence * 100).toFixed(0)}% Confidence)</span>
                      </div>
                    </div>

                    {scanResult.web_context && (
                      <div className="reverse-search-bar">
                        <span className="reverse-label">🌐 Whole-Image Reverse Search:</span>
                        <div className="reverse-buttons">
                          <button onClick={() => handleReverseSearch('google')} className="btn-rev-google">🔎 Google Full Image</button>
                          <button onClick={() => handleReverseSearch('tineye')} className="btn-rev-tineye">🕵️ TinEye Full Photo</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Chat Conversation Messages Area */}
                {messages.length > 0 && (
                  <div className="chat-content-area">
                    <div className="messages-scroll-window">
                      {messages.map((msg, index) => (
                        <div key={index} className={`chat-message ${msg.sender}`}>
                          <span className="msg-avatar">{msg.sender === 'user' ? '👤' : '🤖'}</span>
                          <div className="msg-body">
                            <div className="msg-text">{msg.text}</div>
                            {msg.scrubbed && (
                              <div className="msg-scrubbed">
                                🔒 Scrubbed PII sent to cloud: {msg.scrubbed}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {loadingChat && <div className="typing-indicator">mai-assistant AI is processing request...</div>}
                    </div>
                  </div>
                )}

                {/* Control Input Bar at Bottom */}
                <form onSubmit={handleSendMessage} className="bottom-input-bar">
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Initiate a query or send a command to mai-assistant..."
                    className="main-chat-input"
                  />

                  <div className="input-bottom-row">
                    <div className="input-toolbar-left">
                      <button type="button" onClick={triggerFileInput} className="btn-icon-plus" title="Add File / Attachment">📎</button>
                      <button type="button" onClick={triggerFileInput} className="btn-pill-tool">💡 Reasoning</button>
                      <button type="button" onClick={triggerFileInput} className="btn-pill-tool">✏️ Upload Image</button>
                      <button type="button" onClick={() => showToast("🔎 Reverse Search & Deep Research Tools ready")} className="btn-pill-tool">📊 Deep Research</button>
                    </div>

                    <button type="submit" disabled={loadingChat} className="btn-generate-cyan" title="Ask / Send Command">
                      ⚡
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Bottom 4 Feature Cards Grid (Matching reference mockup layout) */}
            <div className="bottom-cards-grid">
              <div className="feature-grid-card" onClick={triggerFileInput}>
                <div className="grid-card-icon icon-blue">📝</div>
                <div className="grid-card-title">Deepfake Scanner</div>
                <div className="grid-card-sub">Upload & analyze synthetic media artifacts</div>
              </div>

              <div className="feature-grid-card" onClick={() => setActiveModal('features')}>
                <div className="grid-card-icon icon-pink">💡</div>
                <div className="grid-card-title">Reverse Search</div>
                <div className="grid-card-sub">Google Lens & TinEye whole-image tracking</div>
              </div>

              <div className="feature-grid-card" onClick={() => setActiveModal('how-it-works')}>
                <div className="grid-card-icon icon-yellow">🖥️</div>
                <div className="grid-card-title">PII Protection</div>
                <div className="grid-card-sub">RA 10173 compliant local data masking</div>
              </div>

              <div className="feature-grid-card" onClick={focusChatInput}>
                <div className="grid-card-icon icon-green">💬</div>
                <div className="grid-card-title">Trust & Safety AI</div>
                <div className="grid-card-sub">Ask any online safety or scam question</div>
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* Interactive Feature Modals */}
      {activeModal && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content-box" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setActiveModal(null)}>✕</button>

            {activeModal === 'about' && (
              <div>
                <h2>🛡️ About mai-assistant AI Assistant</h2>
                <p>mai-assistant is a comprehensive Trust & Safety solution designed for deepfake detection, reverse image tracking, and local PII privacy masking.</p>
                <p>Our mission is to help users identify synthetic media and protect personal confidentiality on the web.</p>
              </div>
            )}

            {activeModal === 'features' && (
              <div>
                <h2>⚡ Key Platform Features</h2>
                <ul>
                  <li><strong>📸 AI Forensic Scan:</strong> Uses Sightengine AI models to detect synthetic and deepfake images.</li>
                  <li><strong>🕵️ Whole-Image Reverse Search:</strong> Instant verification with Google Lens and TinEye.</li>
                  <li><strong>🔒 Local PII Masking:</strong> Scrubs sensitive personal info (emails, phone numbers, SSNs) locally before cloud AI processing.</li>
                </ul>
              </div>
            )}

            {activeModal === 'how-it-works' && (
              <div>
                <h2>⚙️ How It Works</h2>
                <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <li>Upload or drag & drop an image file into the MindSpark scanner.</li>
                  <li>Click <strong>Scan Image</strong> to perform an instant forensic analysis.</li>
                  <li>Review AI confidence scores and click reverse search links to check web origins.</li>
                  <li>Chat with the Trust & Safety AI assistant safely with masked privacy safeguards!</li>
                </ol>
              </div>
            )}

            {activeModal === 'blog' && (
              <div>
                <h2>📰 Blog & Research Articles (23 Updates)</h2>
                <p>Explore our latest publications on AI Deepfake Trends, Misinformation Tracking, and Privacy Preserving Machine Learning.</p>
                <button className="btn-generate-cyan" style={{ marginTop: '14px' }} onClick={() => { setActiveModal(null); showToast("📚 Blog post list loaded!"); }}>
                  View All 23 Articles
                </button>
              </div>
            )}

            {activeModal === 'extension' && (
              <div>
                <h2>🧩 Add to Chrome Extension</h2>
                <p>Scan any image on Facebook, news sites, or social media by right-clicking!</p>

                <div style={{ background: '#0b0f19', padding: '16px', borderRadius: '12px', margin: '14px 0', border: '1px solid rgba(56, 189, 248, 0.3)', textAlign: 'left' }}>
                  <div style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 'bold', marginBottom: '8px' }}>
                    🛡️ Google Chrome Extension Installation:
                  </div>
                  <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.88rem', color: '#cbd5e1' }}>
                    <li>Click <strong>Add to Chrome</strong> below to download the extension files.</li>
                    <li>Unzip the downloaded folder on your computer.</li>
                    <li>Go to <code>chrome://extensions</code> in your Chrome browser address bar.</li>
                    <li>Toggle <strong>Developer mode</strong> ON (top right corner).</li>
                    <li>Click <strong>Load unpacked</strong> and select the <code>extension</code> folder.</li>
                  </ol>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <a
                    href="https://github.com/Juner1c/AI_Assistant/archive/refs/heads/main.zip"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-generate-cyan"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none', textAlign: 'center' }}
                  >
                    📥 Add to Chrome (Download Extension)
                  </a>
                </div>

                <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '12px' }}>
                  🔒 <em>Note for Capstone Panelists: Google Chrome security requires non-store developer extensions to be enabled via Developer Mode. Once published on the Chrome Web Store, this button performs a 1-click automatic installation.</em>
                </p>
              </div>
            )}

            {activeModal === 'server' && (
              <div>
                <h2>⚙️ Backend Server Connection Settings</h2>
                <p>Ensure your Python FastAPI backend is running and reachable by all group mates.</p>

                <div style={{ background: '#0b0f19', padding: '16px', borderRadius: '12px', margin: '14px 0', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 'bold' }}>
                    FastAPI Backend URL:
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      defaultValue={backendUrl}
                      id="input-backend-url"
                      placeholder="http://localhost:8000 or http://192.168.x.x:8000"
                      style={{
                        flex: 1,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        outline: 'none'
                      }}
                    />
                    <button
                      className="btn-generate-cyan"
                      style={{ borderRadius: '8px', padding: '10px 16px' }}
                      onClick={() => {
                        const val = document.getElementById('input-backend-url').value;
                        if (val) updateBackendUrl(val);
                      }}
                    >
                      Save
                    </button>
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '0.8rem', color: serverStatus === 'online' ? '#4ade80' : '#f87171' }}>
                    Status: <strong>{serverStatus === 'online' ? '🟢 Connected & Ready' : '🔴 Cannot Reach Backend'}</strong>
                  </div>
                </div>

                <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: '1.5' }}>
                  💡 <strong>Tip for Group Mates:</strong><br />
                  - If testing on the <strong>same Wi-Fi network</strong>, use your host PC's IP address (e.g. <code>http://192.168.X.X:8000</code>).<br />
                  - If testing <strong>online / remotely</strong>, deploy the backend to Render / Railway and paste the cloud URL above!
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;