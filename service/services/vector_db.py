from pinecone import Pinecone, ServerlessSpec
from sentence_transformers import SentenceTransformer
import os
from typing import Dict, List

class VectorDB:
    def __init__(self):
        # Initialize Pinecone
        pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        
        self.index_name = os.getenv("PINECONE_INDEX_NAME", "spherical-candidates")
        
        # Use best model for semantic matching
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        
        # Create index if it doesn't exist
        existing_indexes = [index.name for index in pc.list_indexes()]
        
        if self.index_name not in existing_indexes:
            pc.create_index(
                name=self.index_name,
                dimension=384,
                metric="cosine",
                spec=ServerlessSpec(
                    cloud="aws",
                    region=os.getenv("PINECONE_ENVIRONMENT", "us-east-1")
                )
            )
        
        self.index = pc.Index(self.index_name)
    
    def create_embedding(self, text: str) -> List[float]:
        """Generate embedding from text"""
        if not text or len(text.strip()) == 0:
            text = "no data"
        return self.model.encode(text, normalize_embeddings=True).tolist()
    
    def upsert_candidate(self, user_id: str, profile_data: Dict):
        """
        Store candidate in vector DB
        Combine all relevant fields for better matching
        """
        # Create comprehensive text representation
        text_parts = []
        
        if profile_data.get('skills'):
            text_parts.append(f"Skills: {profile_data['skills']}")
        
        if profile_data.get('experience'):
            text_parts.append(f"Experience: {profile_data['experience']}")
        
        if profile_data.get('education'):
            text_parts.append(f"Education: {profile_data['education']}")
        
        if profile_data.get('years_of_experience'):
            text_parts.append(f"Years: {profile_data['years_of_experience']}")
        
        # Add raw text for comprehensive matching
        if profile_data.get('raw_text'):
            text_parts.append(profile_data['raw_text'][:2000])  # First 2000 chars
        
        combined_text = " | ".join(text_parts)
        
        # Generate embedding
        embedding = self.create_embedding(combined_text)
        
        # Prepare metadata (only store important fields, not full text)
        metadata = {
            "skills": profile_data.get('skills', '')[:1000],  # Pinecone metadata limit
            "experience": profile_data.get('experience', '')[:500],
            "education": profile_data.get('education', '')[:500],
            "email": profile_data.get('email', ''),
            "years_exp": profile_data.get('years_of_experience', '')
        }
        
        # Upsert to Pinecone
        self.index.upsert(
            vectors=[
                {
                    "id": user_id,
                    "values": embedding,
                    "metadata": metadata
                }
            ]
        )
        
        print(f"✅ Candidate {user_id} stored in vector DB")
    
    def search(self, query: str, top_k: int = 10) -> List[Dict]:
        """
        Search for candidates based on query
        Returns candidates with similarity scores
        """
        # Generate query embedding
        query_embedding = self.create_embedding(query)
        
        # Search in Pinecone
        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True
        )
        
        matches = results.get('matches', [])
        
        print(f"🔍 Found {len(matches)} matches for query: '{query}'")
        
        return matches