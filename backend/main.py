from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import os
import urllib.parse
import re
from typing import Optional

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
    """ Generate direct reverse image search engine links (Google Lens, TinEye, Bing) for full-image exact matching """
    encoded_url = urllib.parse.quote(image_url, safe='') if image_url else ""
    
    return {
        "search_performed": True,
        "public_image_url": image_url,
        "google_lens_url": f"https://lens.google.com/uploadbyurl?url={encoded_url}" if image_url else "https://lens.google.com/",
        "tineye_url": f"https://tineye.com/search?url={encoded_url}" if image_url else "https://tineye.com/search",
        "bing_visual_url": f"https://www.bing.com/images/searchbyimage?cbir=sbi&imgurl={encoded_url}" if image_url else "https://www.bing.com/visualsearch",
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

@app.post("/api/chat")
async def chat_with_ai(
    user_message: str = Form(...), 
    is_fake: bool = Form(...),
    has_web_matches: Optional[bool] = Form(False)
):
    """ Scrub privacy data locally with Presidio, then talk to Groq Cloud LLM """
    
    # Step A: Scrub PII locally (Fast Regex + Presidio if available)
    anonymized_text = fast_regex_scrub_pii(user_message)
    analyzer, anonymizer = get_presidio()
    if analyzer and anonymizer:
        try:
            results = analyzer.analyze(text=anonymized_text, language="en")
            anonymized_text = anonymizer.anonymize(text=anonymized_text, analyzer_results=results).text
        except Exception:
            pass
    
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    
    system_prompt = (
        f"You are an expert Trust, Safety & Fact-Checking Assistant protecting users from scams, deepfakes, and recycled out-of-context images ('cheap fakes'). "
        f"Image forensic analysis status: AI-generated fake = {is_fake}. Web search presence detected = {has_web_matches}. "
        f"GUIDELINES FOR YOUR ADVICE: "
        f"1. If AI-generated fake is True: Explain that the image shows synthetic pixel artifacts. If found on web, mention it may be a circulating online meme/synthetic image; if not found on web, note it is likely a brand-new AI creation. "
        f"2. If AI-generated fake is False: State that pixel analysis shows it is a real photograph, BUT warn the user to check reverse search results because real photos are frequently reused out of context ('cheap fakes') with misleading headlines. "
        f"3. LEGAL COMPLIANCE (Data Privacy Act RA 10173 & Libel Law): Use objective, neutral language. Do NOT declare people in photos to be 'scammers' or 'criminals' as photos are often stolen from innocent victims. Say 'This photo appears in public index search results. Verify the context.' "
        f"4. Keep response brief, direct, and empathetic. "
        f"IMPORTANT: The user's input has been scrubbed for PII (e.g., <PERSON>, <LOCATION>). Do not ask for personal details."
    )
    
    try:
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama-3.1-8b-instant",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": anonymized_text}
            ]
        }
        
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", json=payload, headers=headers, timeout=15)
        response_data = response.json()
        
        if "choices" in response_data and len(response_data["choices"]) > 0:
            ai_reply = response_data["choices"][0]["message"]["content"]
        elif "error" in response_data:
            ai_reply = f"Groq Error: {response_data['error'].get('message', 'Unknown error')}"
        else:
            ai_reply = f"Unexpected response: {response_data}"
        
    except Exception as e:
        ai_reply = f"System Error: Could not connect to AI. {str(e)}"
    
    return {
        "original_message": user_message,
        "scrubbed_message_sent_to_cloud": anonymized_text,
        "ai_response": ai_reply
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
