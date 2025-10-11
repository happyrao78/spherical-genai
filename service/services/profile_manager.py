from pymongo import MongoClient
from typing import Dict, Optional
import os

class ProfileManager:
    def __init__(self):
        self.client = MongoClient(os.getenv("MONGODB_URI"))
        self.db = self.client.spherical
        self.profiles = self.db.profiles
    
    def create_or_update_profile(self, user_id: str, profile_data: Dict) -> Dict:
        profile = {
            "user_id": user_id,
            "skills": profile_data.get('skills', ''),
            "experience": profile_data.get('experience', ''),
            "email": profile_data.get('email', ''),
            "phone": profile_data.get('phone', ''),
            "raw_text": profile_data.get('raw_text', '')
        }
        
        self.profiles.update_one(
            {"user_id": user_id},
            {"$set": profile},
            upsert=True
        )
        
        return profile
    
    def get_profile(self, user_id: str) -> Optional[Dict]:
        profile = self.profiles.find_one({"user_id": user_id}, {"_id": 0})
        return profile
    
    def update_profile(self, user_id: str, updates: Dict) -> Dict:
        self.profiles.update_one(
            {"user_id": user_id},
            {"$set": updates}
        )
        return self.get_profile(user_id)