from pinecone import Pinecone, ServerlessSpec
from sentence_transformers import SentenceTransformer
import os
from typing import Dict, List

class VectorDB:
    def __init__(self):
        # Initialize Pinecone (new syntax)
        pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        
        self.index_name = os.getenv("PINECONE_INDEX_NAME", "spherical-candidates")
        
        # Create index if it doesn't exist
        existing_indexes = [index.name for index in pc.list_indexes()]
        
        if self.index_name not in existing_indexes:
            pc.create_index(
                name=self.index_name,
                dimension=384,  # MiniLM dimension
                metric="cosine",
                spec=ServerlessSpec(
                    cloud="aws",
                    region=os.getenv("PINECONE_ENVIRONMENT", "us-east-1")
                )
            )
        
        self.index = pc.Index(self.index_name)
        
        # Initialize embedding model
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
    
    def create_embedding(self, text: str) -> List[float]:
        return self.model.encode(text).tolist()
    
    def upsert_candidate(self, user_id: str, profile_data: Dict):
        # Create text representation
        text = f"{profile_data.get('skills', '')} {profile_data.get('experience', '')} {profile_data.get('raw_text', '')}"
        
        # Generate embedding
        embedding = self.create_embedding(text)
        
        # Upsert to Pinecone
        self.index.upsert(
            vectors=[
                {
                    "id": user_id,
                    "values": embedding,
                    "metadata": {
                        "skills": profile_data.get('skills', ''),
                        "experience": profile_data.get('experience', ''),
                        "email": profile_data.get('email', '')
                    }
                }
            ]
        )
    
    def search(self, query: str, top_k: int = 10) -> List[Dict]:
        query_embedding = self.create_embedding(query)
        
        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True
        )
        
        return results['matches']