# ✦ MindSpark: AI Detector & Deepfake Safety Assistant

MindSpark is an end-to-end Trust & Safety solution designed for **AI Deepfake Forensic Analysis**, **Reverse Image Search Tracking**, **Local PII Privacy Masking**, and a **Chrome Extension** for right-click web scanning.

---

## 🚀 Features

- **📸 AI Image Forensic Scan**: Uses Sightengine AI models to detect synthetic pixels and AI generation artifacts.
- **🕵️ Web Origin Tracking**: Reverse search images on Google Lens, TinEye, and Bing Visual Search.
- **🔒 Local PII Masking**: Microsoft Presidio scrubs names, phone numbers, locations, and personal identifiers locally before sending messages to cloud LLMs.
- **🧩 Chrome Extension**: Right-click any image on Facebook, news sites, or social media to run instant forensic scans.

---

## 🧩 How to Install the Chrome Extension

1. **Download ZIP**: Click the green **Code** button at the top of this repository and select **Download ZIP** (or [Download Directly](https://github.com/Juner1c/AI_Assistant/archive/refs/heads/main.zip)).
2. **Extract**: Unzip the folder on your computer.
3. **Open Chrome**: Go to `chrome://extensions` in Google Chrome (or Edge/Brave).
4. **Developer Mode**: Toggle **Developer mode** **ON** in the top-right corner.
5. **Load Extension**: Click **Load unpacked** (top-left) and select the `extension` folder inside the unzipped directory.
6. **Scan Images**: Right-click any image on the web and select **"🔍 Scan this Image with AI Detector"**.

---

## 🛠️ Project Structure

```text
├── frontend/     # React + Vite web app (Deployable to Netlify)
├── backend/      # Python FastAPI server with Presidio PII scrubbing (Deployable to Render)
└── extension/    # Chrome Extension (Manifest V3)
```

---

## 💻 Running Locally

### 1. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 2. Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
uvicorn main:app --reload --port 8000
```
