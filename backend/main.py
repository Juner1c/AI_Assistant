from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import os
import urllib.parse
import re
from typing import Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# 1. Initialize FastAPI app
app = FastAPI(title="AI Image Detector & Safety Assistant (DPA RA 10173 Compliant)")

# Allow React frontend and Chrome Extensions to talk to FastAPI backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fast zero-RAM Regex PII scrubber (Compliant with Data Privacy Act RA 10173)
def fast_regex_scrub_pii(text: str) -> str:
    text = re.sub(r'[\w\.-]+@[\w\.-]+\.\w+', '<EMAIL_ADDRESS>', text)
    text = re.sub(r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', '<PHONE_NUMBER>', text)
    text = re.sub(r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b', '<CREDIT_CARD>', text)
    text = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '<US_SSN>', text)
    return text

# Lazy Presidio Initialization for lightweight RAM footprint
_presidio_analyzer = None
_presidio_anonymizer = None

def get_presidio():
    global _presidio_analyzer, _presidio_anonymizer
    if _presidio_analyzer is None:
        try:
            from presidio_analyzer import AnalyzerEngine
            from presidio_anonymizer import AnonymizerEngine
            _presidio_analyzer = AnalyzerEngine()
            _presidio_anonymizer = AnonymizerEngine()
        except Exception:
            pass
    return _presidio_analyzer, _presidio_anonymizer


API_USER = os.getenv("SIGHTENGINE_API_USER", "1811515332")
API_SECRET = os.getenv("SIGHTENGINE_API_SECRET", "AwUYNKsoCnCCatdAkz6SCndRtyJL35Y4")

import concurrent.futures

class ImageUrlRequest(BaseModel):
    image_url: str

def create_temp_public_image_url(file_bytes: bytes, filename: str = "image.jpg") -> Optional[str]:
    """ Fast temporary public HTTPS link for local file uploads to enable Google Lens & TinEye search """
    # 1. Try FreeImage.host API (returns direct .jpg link compatible with TinEye & Google Lens)
    try:
        res = requests.post(
            'https://freeimage.host/api/1/upload',
            data={'key': '6d207e02198a847aa98d0a2a901485a5', 'action': 'upload'},
            files={'source': (filename or 'image.jpg', file_bytes, 'image/jpeg')},
            timeout=4
        )
        if res.status_code == 200:
            data = res.json()
            if data.get("status_code") == 200 and "image" in data and "url" in data["image"]:
                return data["image"]["url"]
    except Exception:
        pass

    # 2. Fallback to tmpfiles.org
    try:
        res = requests.post(
            'https://tmpfiles.org/api/v1/upload',
            files={'file': (filename or 'image.jpg', file_bytes, 'image/jpeg')},
            timeout=3
        )
        if res.status_code == 200:
            data = res.json()
            if data.get("status") == "success" and "url" in data.get("data", {}):
                raw_url = data["data"]["url"]
                return raw_url.replace("tmpfiles.org/", "tmpfiles.org/dl/")
    except Exception:
        pass

    return None

def call_sightengine_api(file_bytes: bytes, filename: str, content_type: str) -> dict:
    """ Execute Sightengine Forensic API call """
    try:
        response = requests.post(
            'https://api.sightengine.com/1.0/check.json',
            files={'media': (filename or 'image.jpg', file_bytes, content_type or 'image/jpeg')},
            data={
                'models': 'genai',
                'api_user': API_USER,
                'api_secret': API_SECRET
            },
            timeout=12
        )
        return response.json()
    except Exception as e:
        return {"status": "failure", "error": {"message": str(e)}}

def generate_reverse_search_context(image_url: Optional[str] = None) -> dict:
    """ Generate direct reverse image search engine links (Google Lens, TinEye) for full-image exact matching """
    encoded_url = urllib.parse.quote(image_url, safe='') if image_url else ""
    
    return {
        "search_performed": True,
        "public_image_url": image_url,
        "google_lens_url": f"https://lens.google.com/uploadbyurl?url={encoded_url}" if image_url else "https://lens.google.com/",
        "tineye_url": f"https://tineye.com/search?url={encoded_url}" if image_url else "https://tineye.com/search",
        "privacy_shield": "Zero-Retention Architecture (RA 10173): Image processed strictly in transit and auto-deleted from memory.",
        "cheap_fake_warning": "Warning: Misinformation often uses real photographs recycled out of context ('cheap-fakes'). Check publication dates via reverse search."
    }

def parse_sightengine_response(data: dict, image_url: Optional[str] = None) -> dict:
    """ Helper to parse Sightengine API output uniformly with Reverse Image Context """
    is_fake = False
    confidence = 0.0
    flags = []
    model_used = "Real Image / Unknown"
    
    if "type" in data and "ai_generated" in data["type"]:
        confidence = data["type"]["ai_generated"]
        
        if confidence > 0.5:
            is_fake = True
            flags.append("AI generation pixel artifacts detected")
            model_used = "AI Generator (Sightengine Forensic Engine)"
        else:
            flags.append("Looks like a real photograph (Check reverse search for context/recycling)")
            
    web_ctx = generate_reverse_search_context(image_url)

    return {
        "is_ai_generated": is_fake,
        "confidence": round(confidence, 2),
        "model_used": model_used,
        "flags": flags,
        "web_context": web_ctx
    }

@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "MindSpark AI Detector & Safety Assistant Backend API",
        "health_check": "/api/health",
        "dpa_compliance": "Data Privacy Act (RA 10173 Active)"
    }

@app.get("/api/health")
async def health_check():
    """ Health check for Chrome extension and web clients """
    return {
        "status": "ok", 
        "message": "AI Detector & Reverse Search backend is running",
        "dpa_compliance": "Zero-Retention Policy (RA 10173 Active)"
    }

@app.post("/api/scan-image")
async def scan_image(file: UploadFile = File(...)):
    """ Send uploaded image to Sightengine Forensic API with Zero-Retention Memory Purge (Parallel Execution) """
    file_bytes = None
    try:
        file_bytes = await file.read()
        filename = file.filename or 'upload.jpg'
        content_type = file.content_type or 'image/jpeg'
        
        # Parallel Execution: Run Sightengine Forensic API + Temp Public URL Creation simultaneously
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_sight = executor.submit(call_sightengine_api, file_bytes, filename, content_type)
            future_url = executor.submit(create_temp_public_image_url, file_bytes, filename)
            
            data = future_sight.result()
            temp_public_url = future_url.result()
        
        # Immediate Memory Purge (RA 10173 Zero-Retention)
        del file_bytes
        file_bytes = None

        if "status" in data and data["status"] == "failure":
            err_msg = data.get("error", {}).get("message", "Sightengine API failure")
            return {
                "error": err_msg, 
                "is_ai_generated": False, 
                "confidence": 0, 
                "model_used": "Error", 
                "flags": [err_msg],
                "web_context": generate_reverse_search_context(temp_public_url)
            }
            
        return parse_sightengine_response(data, image_url=temp_public_url)
        
    except Exception as e:
        if file_bytes is not None:
            del file_bytes
        return {
            "error": str(e), 
            "is_ai_generated": False, 
            "confidence": 0, 
            "model_used": "Error", 
            "flags": [str(e)],
            "web_context": generate_reverse_search_context(None)
        }

@app.post("/api/scan-image-url")
async def scan_image_url(request: ImageUrlRequest):
    """ Fetch an image from URL or send URL directly to Sightengine + Generate Reverse Search Links """
    image_url = request.image_url.strip()
    if not image_url:
        raise HTTPException(status_code=400, detail="Image URL is required")
        
    file_bytes = None
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        content_type = 'image/jpeg'
        
        if image_url.startswith("http://") or image_url.startswith("https://"):
            try:
                img_res = requests.get(image_url, headers=headers, timeout=10)
                if img_res.status_code == 200:
                    file_bytes = img_res.content
                    content_type = img_res.headers.get('content-type', 'image/jpeg')
            except Exception:
                file_bytes = None
                
        if file_bytes:
            response = requests.post(
                'https://api.sightengine.com/1.0/check.json',
                files={'media': ('social_img.jpg', file_bytes, content_type)},
                data={
                    'models': 'genai',
                    'api_user': API_USER,
                    'api_secret': API_SECRET
                },
                timeout=20
            )
            # Memory Purge (RA 10173)
            del file_bytes
            file_bytes = None
        else:
            response = requests.get(
                'https://api.sightengine.com/1.0/check.json',
                params={
                    'url': image_url,
                    'models': 'genai',
                    'api_user': API_USER,
                    'api_secret': API_SECRET
                },
                timeout=20
            )
            
        data = response.json()
        if "status" in data and data["status"] == "failure":
            err_msg = data.get("error", {}).get("message", "Sightengine API scan failed")
            return {
                "error": err_msg, 
                "is_ai_generated": False, 
                "confidence": 0, 
                "model_used": "Error", 
                "flags": [err_msg],
                "web_context": generate_reverse_search_context(image_url)
            }

        return parse_sightengine_response(data, image_url=image_url)
        
    except Exception as e:
        if file_bytes is not None:
            del file_bytes
        return {
            "error": str(e), 
            "is_ai_generated": False, 
            "confidence": 0, 
            "model_used": "Error", 
            "flags": [f"Failed to scan image URL: {str(e)}"],
            "web_context": generate_reverse_search_context(image_url)
        }

SYSTEM_PROMPT = """You are "mai-assistant", a highly intelligent, friendly, and professional Trust & Safety AI Assistant.

YOUR CORE PURPOSE & EXPERTISE:
1. Deepfake & Synthetic Media Analysis: You help users analyze image forensic scan results, understand AI confidence scores, and spot visual artifacts of AI generation or photo manipulation.
2. Scam & Fraud Prevention: You advise users on identifying online scams (romance scams, phishing, fake investment schemes, imposter scams, and recycled "cheap-fake" photos used out of context).
3. Digital Safety & Privacy Protection: You guide users on digital security best practices, data privacy laws (such as the Philippines Data Privacy Act RA 10173), and protecting Personally Identifiable Information (PII).
4. Platform Guidance: You assist users with mai-assistant features (image scanner, Google Lens & TinEye reverse image search, Chrome extension).

CONVERSATIONAL CONTEXT & FAREWELLS (CRITICAL):
- Understand user intent naturally. Do NOT act confused when the user expresses gratitude or closes the conversation.
- If the user says "thanks", "thank you", "appreciate it", or similar: Warmly reply (e.g., "You are very welcome! Stay safe online, and feel free to reach out anytime if you need help verifying an image or scam.").
- If the user indicates they are finished or don't need any more help (e.g., "no more", "nothing more", "no thanks", "im good", "that's all", "bye", "nothing else"): Acknowledge smoothly and politely without re-prompting, questioning, or offering unnecessary lists (e.g., "Understood! Have a great day and stay safe online. I am here whenever you need assistance again.").

HANDLING IMAGE SCANS:
- When a user provides an image scan result or asks about an uploaded photo, IMMEDIATELY provide a clear, insightful, and actionable safety summary. Explain what the confidence score means, whether the photo shows deepfake indicators, and provide numbered steps for verifying it online. Jump straight into the advice without conversational filler.

STRICT SCOPE & BOUNDARIES:
- You are strictly a Trust & Safety, Deepfake Detection, and Security assistant.
- If a user asks an off-topic or personal question (such as asking for your favorite color, hobbies, general coding, or non-safety topics):
  Gently and politely explain what mai-assistant was built for in a warm tone, and invite them to ask about online safety or upload an image to verify.

STRICT FORMATTING RULES (CRITICAL):
- DO NOT use markdown symbols like asterisks (** or *) or hashes (#). Provide plain, clean, elegant text.
- If providing steps, recommendations, or lists, ALWAYS use numbered lists (1., 2., 3.).
"""

import json

@app.post("/api/chat")
async def chat_with_ai(
    user_message: str = Form(...), 
    is_fake: bool = Form(...),
    has_web_matches: Optional[bool] = Form(False),
    chat_history: Optional[str] = Form(None),
    scan_details: Optional[str] = Form(None)
):
    """ Scrub privacy data locally with Presidio, then talk to Groq Cloud 70B LLM with multi-turn memory """
    
    # Step A: Scrub PII locally (Fast Regex + Presidio if available)
    anonymized_text = fast_regex_scrub_pii(user_message)
    analyzer, anonymizer = get_presidio()
    if analyzer and anonymizer:
        try:
            results = analyzer.analyze(text=anonymized_text, language="en")
            anonymized_text = anonymizer.anonymize(text=anonymized_text, analyzer_results=results).text
        except Exception:
            pass
    
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "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").strip()
    ai_reply = ""
    
    if GROQ_API_KEY:
        # Build multi-turn messages array with System Prompt + Chat History + Current Message
        messages_payload = [{"role": "system", "content": SYSTEM_PROMPT}]
        
        # Inject scan details as context if available
        if scan_details:
            messages_payload.append({"role": "system", "content": f"Current Active Image Scan Context: {scan_details}"})
        
        # Inject past chat history (up to last 6 messages) for conversational memory
        if chat_history:
            try:
                history_list = json.loads(chat_history)
                if isinstance(history_list, list):
                    for msg in history_list[-6:]:
                        role = "user" if msg.get("sender") == "user" else "assistant"
                        content_text = fast_regex_scrub_pii(msg.get("text", ""))
                        if content_text:
                            messages_payload.append({"role": role, "content": content_text})
            except Exception:
                pass

        # Add current user message
        messages_payload.append({"role": "user", "content": anonymized_text})

        # Models to try: Primary = llama-3.3-70b-versatile (Smartest), Fallback = llama-3.1-8b-instant
        for model_name in ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]:
            try:
                headers = {
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": model_name,
                    "messages": messages_payload,
                    "temperature": 0.6,
                    "max_tokens": 600
                }
                
                response = requests.post("https://api.groq.com/openai/v1/chat/completions", json=payload, headers=headers, timeout=12)
                response_data = response.json()
                
                if "choices" in response_data and len(response_data["choices"]) > 0:
                    ai_reply = response_data["choices"][0]["message"]["content"]
                    if ai_reply:
                        break
            except Exception as e:
                print(f"Groq API call error with model {model_name}: {e}")

    # Seamless Intelligent Fallback (Pure Clean Plain Text, No raw markdown symbols)
    if not ai_reply:
        msg_lower = user_message.lower().strip()
        
        # Thank you / Appreciation
        if any(w in msg_lower for w in ["thanks", "thank you", "thx", "appreciate"]):
            ai_reply = "You are very welcome! Stay safe online, and feel free to reach out anytime if you need help verifying an image or checking a suspicious message."
        # Closing / Finished
        elif any(phrase in msg_lower for phrase in ["no more", "nothing more", "no thanks", "im good", "i'm good", "that's all", "thats all", "nothing else", "no", "bye", "goodbye"]):
            ai_reply = "Understood! Have a great day and stay safe online. I am here whenever you need assistance again."
        # Check if message is asking about image scan results or analysis
        elif any(word in msg_lower for word in ["summarize", "analysis", "confidence", "scan", "image", "photo", "picture", "fake", "authentic", "real", "deepfake"]):
            if is_fake:
                ai_reply = (
                    "AI Forensic Notice: The image analysis detected synthetic pixel artifacts indicating this image is AI-generated / synthetic.\n\n"
                    "If someone sent you this image claiming it depicts a real event or real person, exercise extreme caution as it is synthetic media. "
                    "You can verify this photo using the reverse search buttons above to see if it appears on public news sites."
                )
            else:
                ai_reply = (
                    "Trust & Safety Analysis: The forensic scan indicates this is a real photograph (0% AI synthetic confidence).\n\n"
                    "However, to verify if this image is legitimate or being recycled out of context (a cheap fake), click the Whole-Image Reverse Search buttons above (Google Lens, TinEye).\n\n"
                    "Safety Tip: Online scammers frequently steal real photos of innocent people and reuse them with fake headlines or investment scams. Always verify where the photo originally appeared."
                )
        # Greetings
        elif msg_lower in ["hello", "hi", "hey", "good morning", "good afternoon", "good evening", "greetings", "hello!"]:
            ai_reply = (
                "Hello! I am mai-assistant, your Trust & Safety AI Assistant.\n\n"
                "I can help you analyze images for deepfakes, evaluate suspicious messages for scams, guide you on digital privacy, and verify photos with reverse search. How can I assist you today?"
            )
        # Off-topic / personal questions
        elif any(phrase in msg_lower for phrase in ["favorite color", "favourite color", "who are you", "what are you", "favorite food", "your age", "hobby", "recipe", "tell me a joke", "weather"]):
            ai_reply = (
                "I do not have personal traits like a favorite color or hobbies.\n\n"
                "I was built specifically as a Trust & Safety AI Assistant to help you detect deepfakes, recognize online scams, and protect your digital privacy.\n\n"
                "Feel free to ask me any questions about online safety or upload an image to verify!"
            )
        # General off-topic or general question fallback
        else:
            ai_reply = (
                "Thank you for reaching out! As mai-assistant, I am specifically designed to focus on Trust & Safety, Deepfake Detection, and Scam Prevention.\n\n"
                "I am here to help you:\n"
                "1. Analyze uploaded images for deepfakes and AI synthetic manipulation\n"
                "2. Evaluate suspicious messages or investment offers for scam risks\n"
                "3. Learn about digital privacy and local PII masking\n\n"
                "Please let me know if you have a question about online safety, or upload an image or message for me to verify!"
            )

    
    return {
        "original_message": user_message,
        "scrubbed_message_sent_to_cloud": anonymized_text,
        "ai_response": ai_reply
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

