// Service Worker for AI Detector Chrome Extension

const BACKEND_URL = "http://localhost:8000";

// Register context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "scan_image_context_menu",
    title: "🔍 Scan this Image with AI Detector",
    contexts: ["image", "all"]
  });
  console.log("[AI Detector] Context menu registered successfully.");
});

// Handle Context Menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "scan_image_context_menu") {
    const imageUrl = info.srcUrl || info.linkUrl || null;
    
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: "TRIGGER_IMAGE_SCAN",
        srcUrl: imageUrl
      }).catch(err => {
        console.warn("[AI Detector] Failed to send message to content script:", err);
      });
    }
  }
});

// Handle incoming messages from content script and popup dashboard
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SCAN_IMAGE_URL") {
    handleScanImageUrl(request.imageUrl)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (request.action === "SEND_CHAT_MESSAGE") {
    handleChat(request.userMessage, request.isFake)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "CHECK_BACKEND_HEALTH") {
    checkHealth()
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "SAVE_HISTORY") {
    saveScanHistory(request.item);
    sendResponse({ success: true });
    return false;
  }

  if (request.action === "GET_HISTORY") {
    chrome.storage.local.get(["scanHistory"], (res) => {
      sendResponse({ history: res.scanHistory || [] });
    });
    return true;
  }
});

// API Call: Scan Image URL via backend FastAPI endpoint
async function handleScanImageUrl(imageUrl) {
  const response = await fetch(`${BACKEND_URL}/api/scan-image-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ image_url: imageUrl })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Backend response error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  
  // Save scan result to history
  saveScanHistory({
    timestamp: new Date().toISOString(),
    imageUrl,
    is_ai_generated: data.is_ai_generated,
    confidence: data.confidence,
    model_used: data.model_used
  });

  return data;
}

// API Call: Chat with Safety AI Assistant
async function handleChat(userMessage, isFake) {
  const formData = new FormData();
  formData.append("user_message", userMessage);
  formData.append("is_fake", isFake ? "true" : "false");

  const response = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Chat API error (${response.status})`);
  }

  return await response.json();
}

// API Call: Check backend status
async function checkHealth() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { method: "GET" });
    if (res.ok) {
      return await res.json();
    }
    return { status: "offline" };
  } catch (err) {
    return { status: "offline", error: err.message };
  }
}

// Helper: Save scan entry to local storage
function saveScanHistory(entry) {
  chrome.storage.local.get(["scanHistory"], (res) => {
    const history = res.scanHistory || [];
    history.unshift(entry);
    // Keep last 20 scans
    if (history.length > 20) history.pop();
    chrome.storage.local.set({ scanHistory: history });
  });
}
