import google.generativeai as genai
import os
from typing import List, Dict
from services.vector_db import VectorDB
from services.profile_manager import ProfileManager

class SemanticSearch:
    def __init__(self, vector_db: VectorDB):
        self.vector_db = vector_db
        self.profile_manager = ProfileManager()
        
        # Configure Gemini
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        self.model = genai.GenerativeModel('gemini-pro')
    
    def search(self, query: str) -> List[Dict]:
        # Search in vector DB
        matches = self.vector_db.search(query, top_k=10)
        
        if not matches:
            return []
        
        # Get full profiles
        results = []
        for match in matches:
            user_id = match['id']
            profile = self.profile_manager.get_profile(user_id)
            
            if profile:
                # Use Gemini to calculate relevancy
                relevancy_score = self.calculate_relevancy(query, profile)
                
                results.append({
                    "user_id": user_id,
                    "name": profile.get('name', 'Unknown'),
                    "email": profile.get('email', ''),
                    "skills": profile.get('skills', ''),
                    "experience": profile.get('experience', ''),
                    "score": match['score'],
                    "relevancy": relevancy_score
                })
        
        # Sort by relevancy
        results.sort(key=lambda x: x['score'], reverse=True)
        
        return results
    
    def calculate_relevancy(self, query: str, profile: Dict) -> str:
        prompt = f"""
        Query: {query}
        
        Candidate Profile:
        Skills: {profile.get('skills', '')}
        Experience: {profile.get('experience', '')}
        
        Rate the relevancy of this candidate for the query on a scale of 0-100.
        Respond with only the number.
        """
        
        try:
            response = self.model.generate_content(prompt)
            relevancy = response.text.strip()
            return f"{relevancy}%"
        except:
            return "N/A"