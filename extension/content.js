// Content Script for AI Detector Extension

let lastRightClickedImgUrl = null;

// Track right-clicked image elements (handles Facebook overlays & standard images)
document.addEventListener("contextmenu", (e) => {
  lastRightClickedImgUrl = null;

  let elem = e.target;
  
  // 1. Direct IMG element
  if (elem && elem.nodeName === "IMG") {
    lastRightClickedImgUrl = elem.currentSrc || elem.src;
    return;
  }

  // 2. Check SVG image element
  if (elem && elem.nodeName === "image") {
    lastRightClickedImgUrl = elem.getAttribute("href") || elem.getAttribute("xlink:href");
    return;
  }

  // 3. Search parent or children elements for image or CSS background-image
  while (elem && elem !== document.body) {
    // Check if element has an img child
    const imgChild = elem.querySelector && elem.querySelector("img");
    if (imgChild && (imgChild.currentSrc || imgChild.src)) {
      lastRightClickedImgUrl = imgChild.currentSrc || imgChild.src;
      return;
    }

    // Check background-image CSS property
    const bg = window.getComputedStyle(elem).backgroundImage;
    if (bg && bg !== "none" && bg.includes("url(")) {
      const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
      if (match && match[1]) {
        lastRightClickedImgUrl = match[1];
        return;
      }
    }

    elem = elem.parentElement;
  }
}, true);

// Listen for Context Menu trigger command from background worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TRIGGER_IMAGE_SCAN") {
    const imageUrl = request.srcUrl || lastRightClickedImgUrl;
    if (!imageUrl) {
      alert("AI Detector: Could not extract image source URL. Please try right-clicking directly on the image.");
      return;
    }
    
    showScanModal(imageUrl);
    sendResponse({ received: true });
  }
});

// Render floating glassmorphic overlay modal box
function showScanModal(imageUrl) {
  // Remove existing modal if open
  let existingModal = document.getElementById("ai-detector-modal-root");
  if (existingModal) {
    existingModal.remove();
  }

  const root = document.createElement("div");
  root.id = "ai-detector-modal-root";

  root.innerHTML = `
    <div class="ai-detector-overlay" id="aiDetectorOverlay"></div>
    <div class="ai-detector-card" id="aiDetectorCard">
      <div class="ai-detector-header" id="aiDetectorDragHeader">
        <div class="ai-detector-brand">
          <div class="ai-detector-logo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <path d="M11 8v2"></path>
              <path d="M10 11h2"></path>
            </svg>
          </div>
          <span class="ai-detector-title">AI Detector Assistant</span>
        </div>
        <button class="ai-detector-close-btn" id="aiDetectorCloseBtn" title="Close modal">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="ai-detector-body">
        <!-- Image Preview & Scanning Effect -->
        <div class="ai-detector-image-preview-wrapper is-scanning" id="aiDetectorImgWrapper">
          <img src="${imageUrl}" class="ai-detector-preview-img" alt="Scanned Image Preview" />
          <div class="ai-detector-scanner-line"></div>
        </div>

        <!-- Scanning State Banner -->
        <div class="ai-detector-scanning-state" id="aiDetectorScanState">
          <div class="ai-detector-spinner"></div>
          <span>Analyzing AI Artifacts & Synthetic Features...</span>
        </div>

        <!-- Verdict Card Container (Populated after scan) -->
        <div class="ai-detector-verdict-card" id="aiDetectorVerdictContainer" style="display: none;"></div>

        <!-- Chat Assistant Section -->
        <div class="ai-detector-chat-section" id="aiDetectorChatSection" style="display: none;">
          <div class="ai-detector-chat-header">
            <span>Safety AI Assistant</span>
            <span class="ai-detector-pii-shield">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              Presidio Scrubbed
            </span>
          </div>

          <div class="ai-detector-chat-log" id="aiDetectorChatLog">
            <div class="ai-detector-msg msg-ai">
              I am your Trust & Safety assistant. Ask me anything about this image or how to stay safe from scams!
            </div>
          </div>

          <form class="ai-detector-chat-form" id="aiDetectorChatForm">
            <input type="text" class="ai-detector-chat-input" id="aiDetectorChatInput" placeholder="Ask AI safety assistant..." autocomplete="off" required />
            <button type="submit" class="ai-detector-send-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  // Setup Event Listeners inside modal
  const overlay = root.querySelector("#aiDetectorOverlay");
  const closeBtn = root.querySelector("#aiDetectorCloseBtn");
  const card = root.querySelector("#aiDetectorCard");
  const dragHeader = root.querySelector("#aiDetectorDragHeader");

  const closeModal = () => root.remove();
  overlay.addEventListener("click", closeModal);
  closeBtn.addEventListener("click", closeModal);

  // Make modal card draggable
  makeDraggable(card, dragHeader);

  // Initiate scan request to background service worker
  performScan(imageUrl, root);
}

// Execute backend API scan
function performScan(imageUrl, modalRoot) {
  const scanState = modalRoot.querySelector("#aiDetectorScanState");
  const imgWrapper = modalRoot.querySelector("#aiDetectorImgWrapper");
  const verdictContainer = modalRoot.querySelector("#aiDetectorVerdictContainer");
  const chatSection = modalRoot.querySelector("#aiDetectorChatSection");

  chrome.runtime.sendMessage(
    { action: "SCAN_IMAGE_URL", imageUrl },
    (response) => {
      // Remove scanning animation line
      imgWrapper.classList.remove("is-scanning");
      scanState.style.display = "none";

      if (!response || !response.success) {
        const errorMsg = response ? response.error : "Could not connect to AI backend at http://localhost:8000";
        verdictContainer.style.display = "flex";
        verdictContainer.className = "ai-detector-verdict-card verdict-fake";
        verdictContainer.innerHTML = `
          <div class="ai-detector-badge badge-fake">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            Connection Error
          </div>
          <div style="font-size: 12px; color: #fca5a5;">${errorMsg}</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Make sure your FastAPI server is running with <code>python main.py</code>.</div>
        `;
        return;
      }

      const data = response.data;
      const isFake = data.is_ai_generated;
      const confidencePct = Math.round((data.confidence || 0) * 100);

      // Render Verdict Details
      verdictContainer.style.display = "flex";
      verdictContainer.className = `ai-detector-verdict-card ${isFake ? 'verdict-fake' : 'verdict-real'}`;

      const fakeIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      const realIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;

      const webCtx = data.web_context || {};
      const googleUrl = webCtx.google_lens_url || `https://www.google.com/searchbyimage?image_url=${encodeURIComponent(imageUrl)}`;
      const tineyeUrl = webCtx.tineye_url || `https://tineye.com/search?url=${encodeURIComponent(imageUrl)}`;

      verdictContainer.innerHTML = `
        <div class="ai-detector-badge ${isFake ? 'badge-fake' : 'badge-real'}">
          ${isFake ? fakeIcon + 'HIGH RISK - AI GENERATED FAKE' : realIcon + 'AUTHENTIC - REAL PHOTOGRAPH'}
        </div>

        <div class="ai-detector-meter-wrapper">
          <div class="ai-detector-meter-header">
            <span>AI Synthetic Score</span>
            <span>${confidencePct}%</span>
          </div>
          <div class="ai-detector-meter-bar">
            <div class="ai-detector-meter-fill ${isFake ? 'fill-fake' : 'fill-real'}"></div>
          </div>
        </div>

        <div class="ai-detector-flags">
          <div class="ai-detector-flag-item">
            <span class="ai-detector-flag-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></span>
            <strong>Model: ${data.model_used || 'Sightengine Forensic Engine'}</strong>
          </div>
          ${(data.flags || []).map(f => `
            <div class="ai-detector-flag-item">
              <span class="ai-detector-flag-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
              <span>${f}</span>
            </div>
          `).join('')}
        </div>

        <!-- Reverse Image Search & Context Section -->
        <div class="ai-detector-reverse-card">
          <div class="ai-detector-reverse-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span>Whole-Image Reverse Search Matches</span>
          </div>
          <div class="ai-detector-reverse-btns">
            <a href="${googleUrl}" target="_blank" rel="noopener noreferrer" class="ai-detector-btn-reverse btn-lens" title="Google search for full image source">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              Google Full Image
            </a>
            <a href="${tineyeUrl}" target="_blank" rel="noopener noreferrer" class="ai-detector-btn-reverse btn-tineye" title="TinEye whole-photo exact duplicate search">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              TinEye Full Photo
            </a>
          </div>
          <div class="ai-detector-dpa-footer">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            <span>Zero-Retention Architecture (RA 10173 Compliant)</span>
          </div>
        </div>
      `;

      // Animate progress bar fill after render
      setTimeout(() => {
        const fillBar = verdictContainer.querySelector('.ai-detector-meter-fill');
        if (fillBar) fillBar.style.width = `${confidencePct}%`;
      }, 50);

      // Show Chat Section
      chatSection.style.display = "flex";
      setupChatForm(modalRoot, isFake);
    }
  );
}

// Setup Interactive Chat Assistant inside Modal
function setupChatForm(modalRoot, isFake) {
  const form = modalRoot.querySelector("#aiDetectorChatForm");
  const input = modalRoot.querySelector("#aiDetectorChatInput");
  const chatLog = modalRoot.querySelector("#aiDetectorChatLog");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const userText = input.value.trim();
    if (!userText) return;

    // Append user message
    const userMsgElem = document.createElement("div");
    userMsgElem.className = "ai-detector-msg msg-user";
    userMsgElem.textContent = userText;
    chatLog.appendChild(userMsgElem);

    input.value = "";
    chatLog.scrollTop = chatLog.scrollHeight;

    // Loading AI indicator
    const aiLoadingElem = document.createElement("div");
    aiLoadingElem.className = "ai-detector-msg msg-ai";
    aiLoadingElem.textContent = "AI is thinking (scrubbing PII locally first)...";
    chatLog.appendChild(aiLoadingElem);
    chatLog.scrollTop = chatLog.scrollHeight;

    // Send chat message via background script
    chrome.runtime.sendMessage(
      { action: "SEND_CHAT_MESSAGE", userMessage: userText, isFake },
      (response) => {
        if (response && response.success && response.data.ai_response) {
          aiLoadingElem.textContent = response.data.ai_response;
        } else {
          aiLoadingElem.textContent = "Failed to reach AI Safety Assistant backend.";
        }
        chatLog.scrollTop = chatLog.scrollHeight;
      }
    );
  });
}

// Helper: Make modal element fluidly draggable across screen
function makeDraggable(cardElem, handleElem) {
  let isDragging = false;
  let startX = 0, startY = 0;
  let initialLeft = 0, initialTop = 0;

  handleElem.style.cursor = "grab";

  handleElem.addEventListener("mousedown", (e) => {
    // Prevent dragging if clicking on close button
    if (e.target.closest("#aiDetectorCloseBtn")) return;

    e.preventDefault();
    isDragging = true;
    handleElem.style.cursor = "grabbing";

    const rect = cardElem.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    startX = e.clientX;
    startY = e.clientY;

    // Convert CSS layout to absolute fixed coordinates
    cardElem.style.position = "fixed";
    cardElem.style.top = `${initialTop}px`;
    cardElem.style.left = `${initialLeft}px`;
    cardElem.style.right = "auto";
    cardElem.style.bottom = "auto";
    cardElem.style.transform = "none";

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    e.preventDefault();

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    cardElem.style.top = `${initialTop + dy}px`;
    cardElem.style.left = `${initialLeft + dx}px`;
  }

  function onMouseUp() {
    isDragging = false;
    handleElem.style.cursor = "grab";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }
}

// Helper: Handle direct automatic Reverse Search (Google Lens / TinEye)
function triggerExtReverseSearch(imageUrl, engine) {
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    const targetUrl = engine === "google"
      ? `https://www.google.com/searchbyimage?image_url=${encodeURIComponent(imageUrl)}`
      : `https://tineye.com/search?url=${encodeURIComponent(imageUrl)}`;
    window.open(targetUrl, "_blank");
  } else {
    // For blob: or data: URIs, fetch blob and POST file directly to search engine
    fetch(imageUrl)
      .then(res => res.blob())
      .then(blob => {
        const actionUrl = engine === "google" ? "https://www.google.com/searchbyimage/upload" : "https://tineye.com/search";
        const fieldName = engine === "google" ? "encoded_image" : "image";
        
        const form = document.createElement("form");
        form.method = "POST";
        form.action = actionUrl;
        form.target = "_blank";
        form.enctype = "multipart/form-data";

        const input = document.createElement("input");
        input.type = "file";
        input.name = fieldName;

        const file = new File([blob], "scanned_image.jpg", { type: blob.type || "image/jpeg" });
        try {
          const container = new DataTransfer();
          container.items.add(file);
          input.files = container.files;
        } catch(e) {
          console.warn("DataTransfer fallback:", e);
        }

        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
      })
      .catch(() => {
        const fallbackUrl = engine === "google" ? "https://www.google.com/searchbyimage" : "https://tineye.com/search";
        window.open(fallbackUrl, "_blank");
      });
  }
}
