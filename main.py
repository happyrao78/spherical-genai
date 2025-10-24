from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict
import os
from pathlib import Path
from dotenv import load_dotenv

import cloudinary
import cloudinary.uploader

from service.services.auth import verify_token
from service.services.resume_processor import process_resume
from service.services.vector_db import VectorDB
from service.services.profile_manager import ProfileManager
from service.services.semantic_search import SemanticSearch


load_dotenv()

app = FastAPI()

# --- Cloudinary Configuration ---
cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME")
api_key = os.getenv("CLOUDINARY_API_KEY")
api_secret = os.getenv("CLOUDINARY_API_SECRET")

cloudinary.config(
    cloud_name=cloud_name,
    api_key=api_key,
    api_secret=api_secret,
)


# --- CORS Configuration ---
# Define allowed origins
origins = [
    "http://localhost:5173",  # Allow local client development server
    "http://localhost:5174",  # Allow local admin development server
    "https://spherical-genai.vercel.app",  # Allow your deployed client app
    "https://spherical-genai-f6eq.vercel.app",  # Allow your deployed admin app
    "https://spherical-genai-employer.vercel.app/login", 
    "https://spherical-genai-candidate.vercel.app",
    # Add any other origins if needed
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # Use the list of allowed origins
    allow_credentials=True,
    allow_methods=["*"], # Allows all methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"], # Allows all headers
)


# Create temp folder
TEMP_DIR = Path("temp")
TEMP_DIR.mkdir(exist_ok=True)


# Initialize services
vector_db = VectorDB()
profile_manager = ProfileManager()
semantic_search = SemanticSearch(vector_db)


# --- Pydantic Models ---
class JobData(BaseModel):
    job_id: str
    role: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None

class BatchMatchRequest(BaseModel):
    user_id: Optional[str] = None
    jobs: List[JobData]

class BatchMatchResponseItem(BaseModel):
    job_id: str
    matchScore: int

class ProfileUpdate(BaseModel):
    skills: Optional[str] = None
    experience: Optional[str] = None
    education: Optional[str] = None

class SearchQuery(BaseModel):
    query: str


# --- API Endpoints ---
@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/upload-resume")
async def upload_resume(
    resume: UploadFile = File(...),
    authorization: str = Header(None)
):
    print("\n--- Received request to /api/upload-resume ---")
    user_id = verify_token(authorization)
    if not user_id:
        print("[DEBUG] Unauthorized access detected.")
        raise HTTPException(status_code=401, detail="Unauthorized")

    print(f"[DEBUG] User authenticated: {user_id}")

    file_path = TEMP_DIR / resume.filename
    print(f"[DEBUG] Temporary file path: {file_path}")

    try:
        # Save the file locally first
        with open(file_path, "wb") as f:
            content = await resume.read()
            f.write(content)
        print(f"[DEBUG] File '{resume.filename}' saved locally.")

        # Upload to Cloudinary
        print("[DEBUG] Attempting to upload to Cloudinary...")
        upload_result = cloudinary.uploader.upload(
            str(file_path),
            upload_preset="genai-uploads",   # 🔹 your unsigned preset name
            resource_type="raw",             # important for PDFs
            folder="resumes" 
        )

        print("\n--- Cloudinary Upload Result ---")
        print(upload_result)
        print("--------------------------------\n")

        secure_url = upload_result.get("secure_url")

        if not secure_url:
            print("[DEBUG] ERROR: 'secure_url' not found in Cloudinary response.")
            raise HTTPException(status_code=500, detail="Could not upload resume to cloud storage.")

        resume_url_to_save = secure_url
        print(f"[SERVICE-DEBUG] Using original secure_url: {resume_url_to_save}")

        # Process resume text
        extracted_data = process_resume(str(file_path))
        extracted_data["resume_url"] = resume_url_to_save # Save the original URL
        print("[DEBUG] Resume processed successfully.")

        # Store in vector DB
        vector_db.upsert_candidate(user_id, extracted_data)
        print("[DEBUG] Candidate data upserted to vector DB.")

        # Save profile to MongoDB
        profile_manager.create_or_update_profile(user_id, extracted_data)
        print("[DEBUG] Profile saved to MongoDB.")

        print("--- Resume upload process completed successfully ---\n")
        return {"message": "Resume processed successfully", "data": extracted_data}

    except Exception as e:
        print(f"\n--- AN ERROR OCCURRED ---")
        print(f"Exception Type: {type(e).__name__}")
        print(f"Error Details: {e}")
        print("--------------------------\n")
        raise HTTPException(status_code=500, detail=f"Error processing resume: {str(e)}")

    finally:
        # Clean up the temporary file
        try:
            if file_path.exists():
                file_path.unlink()
                print(f"[DEBUG] Temporary file '{file_path}' deleted.")
        except Exception as e:
            print(f"[DEBUG] Error deleting temporary file: {e}")


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

    # Fetch existing profile to merge updates correctly
    existing_profile = profile_manager.get_profile(user_id)
    if not existing_profile:
        # Handle case where profile doesn't exist yet, maybe create it?
        # For now, let's assume update only happens if profile exists
        # Or, just pass the updates directly:
        updated_data_for_mongo = profile_data.dict(exclude_unset=True)
    else:
        # Merge existing with new, ensuring unset fields aren't overwritten with None
        updated_data_for_mongo = existing_profile.copy()
        update_dict = profile_data.dict(exclude_unset=True)
        updated_data_for_mongo.update(update_dict)


    updated_profile_mongo = profile_manager.update_profile(user_id, updated_data_for_mongo)

    # Re-fetch the fully updated profile data for VectorDB upsert
    full_updated_profile = profile_manager.get_profile(user_id)
    if full_updated_profile:
      # Update vector DB with the complete, merged profile data
      vector_db.upsert_candidate(user_id, full_updated_profile)
    else:
      print(f"[WARN] Profile {user_id} not found after update for VectorDB upsert.")


    return {"message": "Profile updated successfully", "profile": full_updated_profile}


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


@app.post("/api/calculate-job-match")
async def calculate_job_match(
    data: dict,
    authorization: str = Header(None)
):
    """Calculate match score between candidate profile and job"""
    # Prioritize user_id from the request body, fallback to token
    user_id = data.get("user_id") or verify_token(authorization)

    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Get candidate profile
    profile = profile_manager.get_profile(user_id)
    if not profile:
        return {"matchScore": 0}

    # The job data might be nested under 'job_data' if coming from Node/Admin
    job_data = data.get('job_data', data)

    # Combine job details for requirements string
    job_requirements = f"{job_data.get('role', '')} {job_data.get('description', '')} {job_data.get('requirements', '')}"

    try:
        match_score = semantic_search.calculate_job_match(profile, job_requirements)
        return {"matchScore": match_score}
    except Exception as e:
        print(f"Error calculating match: {e}")
        return {"matchScore": 0} # Return default score on error


@app.get("/api/admin/resumes/user-ids", response_model=List[str])
async def get_user_ids_with_resumes(
    authorization: str = Header(None)
):
    """Returns a list of user_ids that have uploaded resumes (have profiles)"""
    # Basic check - ensure a valid token exists
    admin_id = verify_token(authorization)
    if not admin_id: # A more robust check might verify admin role via Node API if needed
         raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        # Fetch distinct user_ids from the profiles collection
        user_ids = profile_manager.get_all_profile_user_ids()
        return user_ids
    except Exception as e:
        print(f"Error fetching user_ids with resumes: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving user IDs")


@app.post("/api/calculate-batch-job-match", response_model=List[BatchMatchResponseItem])
async def calculate_batch_job_match(
    request_data: BatchMatchRequest,
    authorization: str = Header(None)
):
    """Calculate match scores for multiple jobs against one profile"""
    # Prioritize user_id from request body (for admin), fallback to token (for candidate)
    user_id = request_data.user_id or verify_token(authorization)

    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Get the single candidate profile needed for all calculations
    profile = profile_manager.get_profile(user_id)
    if not profile:
        # Return scores of 0 for all requested jobs if profile not found
        return [BatchMatchResponseItem(job_id=job.job_id, matchScore=0) for job in request_data.jobs]

    results = []
    # Calculate score for each job sequentially
    for job in request_data.jobs:
        job_requirements = f"{job.role or ''} {job.description or ''} {job.requirements or ''}"
        score = 0 # Default score
        try:
            # Reuse the existing single-score calculation logic
            score = semantic_search.calculate_job_match(profile, job_requirements)
        except Exception as e:
            print(f"Error calculating match for job {job.job_id} and user {user_id}: {e}")
            score = 0 # Assign 0 on error
        results.append(BatchMatchResponseItem(job_id=job.job_id, matchScore=score))

    return results


# --- Main execution ---
if __name__ == "__main__":
    import uvicorn
    # Use PORT environment variable provided by Railway, default to 8000 locally
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
