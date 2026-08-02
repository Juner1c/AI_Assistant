# ✦ MindSpark: AI Detector & Deepfake Safety Assistant

MindSpark is an end-to-end Trust & Safety solution designed for **AI Deepfake Forensic Analysis**, **Reverse Image Search Tracking**, **Local PII Privacy Masking**, and a **Chrome Extension** for right-click web scanning.

---

## 🌐 Deploying 100% Online (For Group Mates & Remote Access)

To make your system accessible to group mates anywhere in the world over the internet:

### Option A: Free Cloud Deployment (Recommended)

1. **Deploy Backend (Render.com)**:
   - Go to [Render.com](https://render.com) and create a free account.
   - Click **New +** -> **Web Service** and connect your GitHub repository (`Juner1c/AI_Assistant`).
   - Set **Root Directory** to `backend`.
   - Set **Build Command**: `pip install -r requirements.txt`
   - Set **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Click **Create Web Service**. You will get a free HTTPS backend URL (e.g., `https://ai-detector-backend.onrender.com`).

2. **Connect Frontend (Netlify / Vercel)**:
   - In Netlify, add Environment Variable `VITE_API_BASE_URL` set to your Render backend URL (e.g. `https://ai-detector-backend.onrender.com`).
   - Or open your live Netlify website, click **`🔴 Backend Offline`** in the top right navbar, and paste your Render HTTPS backend URL!

---

### Option B: Instant Online Public Tunnel (Zero Setup Needed)

If you are running the backend on your laptop right now and want group mates to connect immediately over the internet:

1. In your terminal, run:
   ```bash
   npx localtunnel --port 8000
   ```
2. Localtunnel will give you a public URL (e.g. `https://lazy-fox-99.loca.lt`).
3. Share that URL with your group mates or paste it into the **`⚙️ Backend Settings`** modal in the web app navbar!

---

## 🧩 How to Install the Chrome Extension

1. **Download ZIP**: Click the green **Code** button at the top of this repository and select **Download ZIP** (or [Download Directly](https://github.com/Juner1c/AI_Assistant/archive/refs/heads/main.zip)).
2. **Extract**: Unzip the folder on your computer.
3. **Open Chrome**: Go to `chrome://extensions` in Google Chrome (or Edge/Brave).
4. **Developer Mode**: Toggle **Developer mode** **ON** in the top-right corner.
5. **Load Extension**: Click **Load unpacked** (top-left) and select the `extension` folder inside the unzipped directory.
6. **Scan Images**: Right-click any image on the web and select **"🔍 Scan this Image with AI Detector"**.

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
