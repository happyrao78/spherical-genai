from pymongo import MongoClient
from typing import Dict, Optional, List
import os

class ProfileManager:
    def __init__(self):
        self.client = MongoClient(os.getenv("MONGODB_URI"))
        self.db = self.client.spherical
        self.profiles = self.db.profiles
    
    def create_or_update_profile(self, user_id: str, profile_data: Dict) -> Dict:
        """Store complete profile data"""
        profile = {
            "user_id": user_id,
            "skills": profile_data.get('skills', ''),
            "experience": profile_data.get('experience', ''),
            "education": profile_data.get('education', ''),
            "years_of_experience": profile_data.get('years_of_experience', ''),
            "email": profile_data.get('email', ''),
            "phone": profile_data.get('phone', ''),
            "raw_text": profile_data.get('raw_text', ''),
        }
        
        # Upsert profile
        self.profiles.update_one(
            {"user_id": user_id},
            {"$set": profile},
            upsert=True
        )
        
        print(f"✅ Profile saved for user: {user_id}")
        
        return profile
    
    def get_profile(self, user_id: str) -> Optional[Dict]:
        """Get complete profile"""
        profile = self.profiles.find_one({"user_id": user_id}, {"_id": 0})
        return profile
    
    def update_profile(self, user_id: str, updates: Dict) -> Dict:
        """Update specific fields"""
        self.profiles.update_one(
            {"user_id": user_id},
            {"$set": updates}
        )
        return self.get_profile(user_id)
    
    def get_all_profile_user_ids(self) -> List[str]:
            """Get all distinct user_ids from the profiles collection using distinct()"""
            try:
                # Use distinct to get unique user_ids directly from the database
                user_ids = self.profiles.distinct("user_id")
                # Ensure all items are strings (distinct might return other types if schema is loose)
                return [str(uid) for uid in user_ids if uid is not None]
            except Exception as e:
                print(f"Error fetching distinct user_ids: {e}")
                return [] # Return empty list on error

