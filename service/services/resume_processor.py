import PyPDF2
import docx
import re
from typing import Dict

def extract_text_from_pdf(file_path: str) -> str:
    """Extract all text from PDF"""
    text = ""
    try:
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        print(f"Error reading PDF: {e}")
    return text

def extract_text_from_docx(file_path: str) -> str:
    """Extract all text from DOCX"""
    text = ""
    try:
        doc = docx.Document(file_path)
        for paragraph in doc.paragraphs:
            text += paragraph.text + "\n"
        # Also extract from tables
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    text += cell.text + " "
            text += "\n"
    except Exception as e:
        print(f"Error reading DOCX: {e}")
    return text

def extract_email(text: str) -> str:
    """Extract email using regex"""
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    emails = re.findall(email_pattern, text)
    return emails[0] if emails else ""

def extract_phone(text: str) -> str:
    """Extract phone number"""
    # Indian phone patterns
    phone_patterns = [
        r'\+91[\s-]?\d{10}',  # +91 followed by 10 digits
        r'\d{10}',  # 10 digits
        r'\d{3}[-.\s]?\d{3}[-.\s]?\d{4}',  # US format
    ]
    
    for pattern in phone_patterns:
        phones = re.findall(pattern, text)
        if phones:
            return phones[0]
    return ""

def extract_skills(text: str) -> str:
    """Extract technical skills - comprehensive list"""
    skills_keywords = [
        # Programming Languages
        'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'golang', 'go', 
        'rust', 'kotlin', 'swift', 'php', 'ruby', 'scala', 'r', 'matlab',
        
        # Web Technologies
        'react', 'angular', 'vue', 'nodejs', 'node.js', 'express', 'django', 
        'flask', 'fastapi', 'spring', 'laravel', 'nextjs', 'next.js', 'nuxt',
        'html', 'css', 'sass', 'less', 'tailwind', 'bootstrap', 'jquery',
        
        # Mobile
        'react native', 'flutter', 'android', 'ios', 'xamarin',
        
        # Databases
        'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
        'dynamodb', 'cassandra', 'oracle', 'sqlite', 'mariadb',
        
        # Cloud & DevOps
        'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'k8s',
        'jenkins', 'gitlab', 'github actions', 'terraform', 'ansible',
        'ci/cd', 'devops',
        
        # AI/ML
        'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'keras',
        'scikit-learn', 'pandas', 'numpy', 'nlp', 'computer vision', 'opencv',
        'ai', 'artificial intelligence', 'data science', 'neural networks',
        
        # Other
        'git', 'rest api', 'graphql', 'microservices', 'agile', 'scrum',
        'jira', 'linux', 'bash', 'powershell', 'testing', 'junit', 'pytest',
        'selenium', 'cypress', 'websocket', 'mqtt', 'kafka', 'rabbitmq',
        'blockchain', 'ethereum', 'solidity', 'web3'
    ]
    
    text_lower = text.lower()
    found_skills = set()
    
    for skill in skills_keywords:
        # Use word boundaries for better matching
        pattern = r'\b' + re.escape(skill) + r'\b'
        if re.search(pattern, text_lower):
            found_skills.add(skill.title())
    
    return ", ".join(sorted(found_skills)) if found_skills else ""

def extract_experience(text: str) -> str:
    """Extract work experience section"""
    text_lower = text.lower()
    
    # Find experience section
    experience_keywords = ['experience', 'work history', 'employment', 'professional experience']
    
    for keyword in experience_keywords:
        if keyword in text_lower:
            start_idx = text_lower.index(keyword)
            # Extract next 1000 characters after "experience"
            experience_text = text[start_idx:start_idx + 1000]
            return experience_text.strip()
    
    # If no experience section found, return first 500 chars
    return text[:500].strip()

def extract_education(text: str) -> str:
    """Extract education details"""
    education_keywords = [
        'b.tech', 'btech', 'bachelor', 'master', 'm.tech', 'mtech',
        'mba', 'phd', 'diploma', 'degree', 'university', 'college',
        'iit', 'nit', 'iiit', 'engineering', 'computer science', 'cs'
    ]
    
    text_lower = text.lower()
    education_parts = []
    
    for keyword in education_keywords:
        pattern = r'.{0,50}\b' + re.escape(keyword) + r'\b.{0,50}'
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        education_parts.extend(matches)
    
    if education_parts:
        return " | ".join(set(education_parts[:3]))  # Top 3 matches
    return ""

def extract_years_of_experience(text: str) -> str:
    """Extract total years of experience"""
    patterns = [
        r'(\d+)\+?\s*years?\s*of\s*experience',
        r'experience\s*:?\s*(\d+)\+?\s*years?',
        r'(\d+)\+?\s*yrs',
    ]
    
    text_lower = text.lower()
    for pattern in patterns:
        matches = re.findall(pattern, text_lower)
        if matches:
            return f"{matches[0]} years"
    return ""

def process_resume(file_path: str) -> Dict:
    """
    Complete OCR processing of resume
    Extract all possible information
    """
    # Extract text based on file type
    if file_path.endswith('.pdf'):
        raw_text = extract_text_from_pdf(file_path)
    elif file_path.endswith('.docx'):
        raw_text = extract_text_from_docx(file_path)
    else:
        raise ValueError("Unsupported file format. Only PDF and DOCX allowed.")
    
    if not raw_text or len(raw_text.strip()) < 50:
        raise ValueError("Could not extract meaningful text from resume")
    
    # Extract all information
    extracted_data = {
        "raw_text": raw_text.strip(),
        "email": extract_email(raw_text),
        "phone": extract_phone(raw_text),
        "skills": extract_skills(raw_text),
        "experience": extract_experience(raw_text),
        "education": extract_education(raw_text),
        "years_of_experience": extract_years_of_experience(raw_text),
    }
    
    return extracted_data