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
        self.model = genai.GenerativeModel('gemini-2.5-flash')
    
    def search(self, query: str) -> List[Dict]:
        """
        Semantic search with AI-powered relevancy
        Returns exact matches with scores
        """
        # Search in vector DB
        matches = self.vector_db.search(query, top_k=20)  # Get more candidates
        
        if not matches:
            return []
        
        # Get full profiles and calculate relevancy
        results = []
        
        for match in matches:
            user_id = match['id']
            similarity_score = match.get('score', 0)
            
            # Only consider high similarity candidates (>0.3)
            if similarity_score < 0.3:
                continue
            
            # Get full profile from MongoDB
            profile = self.profile_manager.get_profile(user_id)
            
            if not profile:
                continue
            
            # Calculate AI relevancy
            relevancy_score = self.calculate_ai_relevancy(query, profile)
            
            # Combine scores: 60% vector similarity + 40% AI relevancy
            combined_score = (similarity_score * 0.6) + (relevancy_score / 100 * 0.4)
            
            results.append({
                "user_id": user_id,
                "name": profile.get('name', 'Unknown'),
                "email": profile.get('email', ''),
                "skills": profile.get('skills', ''),
                "experience": profile.get('experience', '')[:200],  # Preview
                "education": profile.get('education', ''),
                "years_experience": profile.get('years_of_experience', ''),
                "vector_score": round(similarity_score * 100, 2),
                "ai_relevancy": relevancy_score,
                "final_score": round(combined_score * 100, 2),
            })
        
        # Sort by final score (highest first)
        results.sort(key=lambda x: x['final_score'], reverse=True)
        
        # Return top 10 matches
        return results[:10]
    
    def calculate_ai_relevancy(self, query: str, profile: Dict) -> int:
        """
        Use Gemini to calculate exact relevancy (0-100)
        """
        prompt = f"""You are an expert recruiter. Analyze if this candidate matches the requirement.

REQUIREMENT: {query}

CANDIDATE PROFILE:
- Skills: {profile.get('skills', 'Not specified')}
- Experience: {profile.get('experience', 'Not specified')[:300]}
- Education: {profile.get('education', 'Not specified')}
- Years of Experience: {profile.get('years_of_experience', 'Not specified')}

INSTRUCTIONS:
1. Rate how well this candidate matches the requirement (0-100)
2. Consider:
   - Skill match (most important)
   - Experience relevance
   - Education background
   - Years of experience
3. Be strict: Only give 80+ for excellent matches
4. Give 50-79 for good matches
5. Give below 50 for poor matches

Respond with ONLY a number between 0-100. No explanation."""

        try:
            response = self.model.generate_content(prompt)
            score_text = response.text.strip()
            
            # Extract number from response
            import re
            numbers = re.findall(r'\d+', score_text)
            
            if numbers:
                score = int(numbers[0])
                # Ensure score is between 0-100
                score = max(0, min(100, score))
                return score
            
            return 50  # Default if can't parse
            
        except Exception as e:
            print(f"Error calculating AI relevancy: {e}")
            return 50  # Default score on error
    
    def calculate_job_match(self, profile: Dict, job_requirements: str) -> int:
        """Calculate how well candidate matches a job"""
        prompt = f"""You are an expert recruiter. Rate how well this candidate matches the job requirement.

        JOB REQUIREMENT:
            {job_requirements}

            CANDIDATE PROFILE:
            - Skills: {profile.get('skills', 'Not specified')}
            - Experience: {profile.get('experience', 'Not specified')[:300]}
            - Education: {profile.get('education', 'Not specified')}
            - Years: {profile.get('years_of_experience', 'Not specified')}

            Rate 0-100. Respond with ONLY a number."""

        try:
            response = self.model.generate_content(prompt)
            score_text = response.text.strip()
            
            import re
            numbers = re.findall(r'\d+', score_text)
            
            if numbers:
                score = int(numbers[0])
                return max(0, min(100, score))
            
            return 50
        except:
            return 50