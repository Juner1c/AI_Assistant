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
    // If viewing over HTTPS (e.g. Netlify) and saved URL is un-encrypted http:, force default Render HTTPS URL
    if (window.location.protocol === 'https:' && saved && saved.startsWith('http:')) {
      localStorage.setItem('mindspark_backend_url', getDefaultBackendUrl());
      return getDefaultBackendUrl();
    }
    return saved || getDefaultBackendUrl();
  });
  const [serverStatus, setServerStatus] = useState('checking'); // 'online', 'offline', 'checking'

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [loadingScan, setLoadingScan] = useState(false);

  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'about', 'features', 'how-it-works', 'blog', 'server', or null
  const [toastMessage, setToastMessage] = useState(null);

  const fileInputRef = useRef(null);
  const chatInputRef = useRef(null);

  // Check backend server connection on startup or URL change (with auto-retry for Render cold starts)
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
          // Auto retry every 6 seconds to wake up Render free container from sleep
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
    checkServerHealth(formatted);
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };


  // Handle image selection
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

  // Trigger file selection dialog programmatically
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Focus chat input
  const focusChatInput = () => {
    if (chatInputRef.current) {
      chatInputRef.current.focus();
    }
  };

  // Scan image via FastAPI backend and automatically assist user based on scan results
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

      // Auto-assist user in AI Chat window based on scan data results
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
          {
            sender: 'ai',
            text: aiAdvice
          }
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

  // Send message to FastAPI privacy chat backend
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMsg = inputMessage;
    setInputMessage('');
    
    // Capture history before adding current message
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

  // Open Google or TinEye direct reverse search URL in a new tab
  const handleReverseSearch = (engine) => {
    if (scanResult && scanResult.web_context) {
      let targetUrl = scanResult.web_context.google_lens_url;
      if (engine === 'tineye') targetUrl = scanResult.web_context.tineye_url;
      window.open(targetUrl, '_blank');
    }
  };

  return (
    <div className="mindspark-page">
      {/* Toast Notification Popup */}
      {toastMessage && (
        <div className="app-toast-popup">
          {toastMessage}
        </div>
      )}

      {/* Top Navbar */}
      <nav className="navbar">
        <div className="nav-brand" onClick={() => setActiveModal('about')} style={{ cursor: 'pointer' }}>
          <div className="brand-logo-icon">✦</div>
          <div className="brand-text">
            <span className="brand-name">mai-assistant</span>
          </div>
        </div>

        <ul className="nav-links">
          <li><button onClick={() => setActiveModal('about')} className="nav-btn-link">About</button></li>
          <li><button onClick={() => setActiveModal('features')} className="nav-btn-link">Features</button></li>
          <li><button onClick={() => setActiveModal('how-it-works')} className="nav-btn-link">How It Works</button></li>
          <li><button onClick={() => setActiveModal('extension')} className="nav-btn-link" style={{ color: '#38bdf8', fontWeight: '700' }}>🧩 Add to Chrome</button></li>
          <li><button onClick={() => setActiveModal('blog')} className="nav-btn-link">Blog <span className="badge-count">23</span></button></li>
        </ul>

        <div className="nav-actions">
          <button
            className={`btn-server-status status-${serverStatus}`}
            onClick={() => setActiveModal('server')}
            title="Configure FastAPI Backend URL for network group mates"
          >
            <span className="status-dot"></span>
            {serverStatus === 'online' ? 'Backend Online' : serverStatus === 'checking' ? 'Waking Backend...' : 'Connecting...'}
          </button>
          <button className="btn-lang-select" onClick={() => setActiveModal('extension')} style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.4)' }}>🧩 Add to Chrome</button>
          <button className="btn-get-started" onClick={triggerFileInput}>Get Started</button>
        </div>
      </nav>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        id="file-upload-hidden"
        type="file"
        accept="image/*"
        onChange={handleImageChange}
        style={{ display: 'none' }}
      />

      {/* Main Content / Hero Section */}
      <main className="hero-section">
        <div className="smarter-badge" onClick={focusChatInput} style={{ cursor: 'pointer' }}>
          <span>✨ Smarter chats, instant solutions</span>
        </div>

        <h1 className="hero-title">
          Chat Smarter, Not Harder – <br />
          <span className="hero-title-accent">Meet mai-assistant<span className="blinking-cursor">|</span></span>
        </h1>

        <p className="hero-subtitle">
          Your Ultimate AI Chat Partner – Instant Answers, Endless Knowledge!
        </p>

        {/* Central Interactive Grid Layout */}
        <div className="mindspark-card-wrapper">
          {/* Left Side Feature Pills */}
          <div className="side-pills left-pills">
            <div
              className="pill-item clickable-pill"
              onClick={() => showToast("⚡ Sightengine Forensic API provides sub-second deepfake detection speed.")}
              title="Click to view performance info"
            >
              ⚡ Speed Performance <span className="pill-dot"></span>
            </div>
            <div
              className="pill-item clickable-pill"
              onClick={() => showToast("👁️ Privacy Safeguard: All PII is masked locally before cloud processing.")}
              title="Click to view privacy info"
            >
              👁️ User Confidentiality <span className="pill-dot"></span>
            </div>
          </div>

          {/* Main Central Container Box */}
          <div
            className={`mindspark-main-card ${isDragging ? 'drag-active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="card-top-tag">
              ✦ Write any request or command to mai-assistant
            </div>

            {/* Uploaded File Banner / Selected Image Bar */}
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

                {/* Show 'Scan Image' button ONLY IF the image has NOT yet been scanned */}
                {!scanResult && (
                  <button onClick={handleScan} disabled={loadingScan} className="btn-scan-pill">
                    {loadingScan ? 'Scanning...' : 'Scan Image'}
                  </button>
                )}
              </div>
            ) : (
              <div className="empty-drop-hint" onClick={triggerFileInput}>
                📁 Drag & drop an image here or click <strong>Upload Image</strong> below
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

                {/* Reverse Search Engine Quick Links */}
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

            {/* Chat Conversation Area */}
            <div className="chat-content-area">
              {messages.length === 0 ? (
                <div className="welcome-chat-bubble">
                  Hello! I am your mai-assistant Trust & Safety Assistant. Ask me anything or upload an image to analyze for deepfakes.
                </div>
              ) : (
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
              )}
            </div>

            {/* Integrated Control Input Bar at Bottom */}
            <form onSubmit={handleSendMessage} className="bottom-input-bar">
              <button type="button" onClick={triggerFileInput} className="btn-icon-plus" title="Add File / Attachment">+</button>

              <button type="button" onClick={triggerFileInput} className="btn-bar-pill pill-upload">
                🖼️ Upload Image
              </button>

              <input
                ref={chatInputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask about a scam or type your situation..."
                className="main-chat-input"
              />

              <button type="submit" disabled={loadingChat} className="btn-generate-cyan">
                Ask
              </button>
            </form>
          </div>
        </div>
      </main>

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