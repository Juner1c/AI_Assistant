document.addEventListener("DOMContentLoaded", () => {
  const backendStatus = document.getElementById("backendStatus");
  const urlScanForm = document.getElementById("urlScanForm");
  const imageUrlInput = document.getElementById("imageUrlInput");
  const scanBtn = document.getElementById("scanBtn");
  const scanResultCard = document.getElementById("scanResultCard");
  const historyList = document.getElementById("historyList");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  // Check backend server connection
  checkBackend();

  // Load history
  loadScanHistory();

  // Handle manual URL scan submission
  urlScanForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const url = imageUrlInput.value.trim();
    if (!url) return;

    scanBtn.disabled = true;
    scanBtn.textContent = "Scanning...";
    scanResultCard.style.display = "block";
    scanResultCard.innerHTML = `<span style="color: #818cf8;">Scanning image URL...</span>`;

    chrome.runtime.sendMessage(
      { action: "SCAN_IMAGE_URL", imageUrl: url },
      (response) => {
        scanBtn.disabled = false;
        scanBtn.textContent = "Scan Image";

        if (response && response.success) {
          const d = response.data;
          const pct = Math.round((d.confidence || 0) * 100);
          scanResultCard.innerHTML = `
            <div class="${d.is_ai_generated ? 'badge-fake' : 'badge-real'}">
              ${d.is_ai_generated ? '🚨 AI Generated Fake' : '✅ Real Photograph'} (${pct}% Score)
            </div>
            <div style="color: #94a3b8; font-size: 11px;">Model: ${d.model_used || 'Forensic API'}</div>
          `;
          loadScanHistory();
        } else {
          const err = response ? response.error : "Failed to connect to backend.";
          scanResultCard.innerHTML = `<span style="color: #ef4444;">Error: ${err}</span>`;
        }
      }
    );
  });

  clearHistoryBtn.addEventListener("click", () => {
    chrome.storage.local.set({ scanHistory: [] }, () => {
      loadScanHistory();
    });
  });

  function checkBackend() {
    chrome.runtime.sendMessage({ action: "CHECK_BACKEND_HEALTH" }, (response) => {
      const dot = backendStatus.querySelector(".status-dot");
      const text = backendStatus.querySelector(".status-text");

      if (response && response.success && response.data.status === "ok") {
        dot.className = "status-dot online";
        text.textContent = "Connected";
      } else {
        dot.className = "status-dot offline";
        text.textContent = "Offline";
      }
    });
  }

  function loadScanHistory() {
    chrome.runtime.sendMessage({ action: "GET_HISTORY" }, (res) => {
      const history = (res && res.history) || [];

      if (history.length === 0) {
        historyList.innerHTML = `<p class="empty-text">No recent scans yet.</p>`;
        return;
      }

      historyList.innerHTML = history.map(item => {
        const pct = Math.round((item.confidence || 0) * 100);
        return `
          <div class="history-item">
            <img src="${item.imageUrl}" class="history-img-thumb" alt="Thumb" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🖼️</text></svg>'" />
            <div class="history-info">
              <div class="history-verdict ${item.is_ai_generated ? 'badge-fake' : 'badge-real'}">
                ${item.is_ai_generated ? '🚨 AI Fake' : '✅ Real'} (${pct}%)
              </div>
              <div class="history-url">${escapeHtml(item.imageUrl)}</div>
            </div>
          </div>
        `;
      }).join('');
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
