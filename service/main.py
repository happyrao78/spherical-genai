from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import os
from pathlib import Path
from dotenv import load_dotenv

from services.auth import verify_token
from services.resume_processor import process_resume
from services.vector_db import VectorDB
from services.profile_manager import ProfileManager
from services.semantic_search import SemanticSearch

load_dotenv()

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create temp folder
TEMP_DIR = Path("temp")
TEMP_DIR.mkdir(exist_ok=True)

# Initialize services
vector_db = VectorDB()
profile_manager = ProfileManager()
semantic_search = SemanticSearch(vector_db)

class ProfileUpdate(BaseModel):
    skills: Optional[str] = None
    experience: Optional[str] = None
    education: Optional[str] = None

class SearchQuery(BaseModel):
    query: str

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.post("/api/upload-resume")
async def upload_resume(
    resume: UploadFile = File(...),
    authorization: str = Header(None)
):
    user_id = verify_token(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Save in local temp folder
    file_path = TEMP_DIR / resume.filename
    
    try:
        with open(file_path, "wb") as f:
            content = await resume.read()
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")
    
    try:
        # Process resume
        extracted_data = process_resume(str(file_path))
        
        # Store in vector DB
        vector_db.upsert_candidate(user_id, extracted_data)
        
        # Save profile
        profile_manager.create_or_update_profile(user_id, extracted_data)
        
        return {"message": "Resume processed successfully", "data": extracted_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing resume: {str(e)}")
    finally:
        # Clean up - delete file
        try:
            if file_path.exists():
                file_path.unlink()
        except Exception as e:
            print(f"Error deleting file: {e}")

@app.get("/api/profile")
async def get_profile(authorization: str = Header(None)):
    user_id = verify_token(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    profile = profile_manager.get_profile(user_id)
    return {"profile": profile}

@app.put("/api/profile")
async def update_profile(
    profile_data: ProfileUpdate,
    authorization: str = Header(None)
):
    user_id = verify_token(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    updated_profile = profile_manager.update_profile(user_id, profile_data.dict(exclude_unset=True))
    
    # Update vector DB
    vector_db.upsert_candidate(user_id, updated_profile)
    
    return {"message": "Profile updated successfully", "profile": updated_profile}

@app.post("/api/semantic-search")
async def semantic_search_endpoint(
    query: SearchQuery,
    authorization: str = Header(None)
):
    user_id = verify_token(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    results = semantic_search.search(query.query)
    return {"results": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)