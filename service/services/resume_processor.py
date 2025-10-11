import PyPDF2
import docx
import re

def extract_text_from_pdf(file_path: str) -> str:
    text = ""
    with open(file_path, 'rb') as file:
        pdf_reader = PyPDF2.PdfReader(file)
        for page in pdf_reader.pages:
            text += page.extract_text()
    return text

def extract_text_from_docx(file_path: str) -> str:
    doc = docx.Document(file_path)
    text = ""
    for paragraph in doc.paragraphs:
        text += paragraph.text + "\n"
    return text

def extract_email(text: str) -> str:
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    emails = re.findall(email_pattern, text)
    return emails[0] if emails else ""

def extract_phone(text: str) -> str:
    phone_pattern = r'\b\d{10}\b|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b'
    phones = re.findall(phone_pattern, text)
    return phones[0] if phones else ""

def extract_skills(text: str) -> str:
    # Common skills keywords
    skills_keywords = [
        'python', 'java', 'javascript', 'react', 'node', 'angular', 'vue',
        'sql', 'mongodb', 'postgresql', 'aws', 'azure', 'docker', 'kubernetes',
        'machine learning', 'deep learning', 'data science', 'ai', 'nlp',
        'html', 'css', 'typescript', 'c++', 'c#', 'golang', 'rust'
    ]
    
    text_lower = text.lower()
    found_skills = []
    
    for skill in skills_keywords:
        if skill in text_lower:
            found_skills.append(skill)
    
    return ", ".join(found_skills) if found_skills else ""

def process_resume(file_path: str) -> dict:
    # Extract text based on file type
    if file_path.endswith('.pdf'):
        text = extract_text_from_pdf(file_path)
    elif file_path.endswith('.docx'):
        text = extract_text_from_docx(file_path)
    else:
        raise ValueError("Unsupported file format")
    
    # Extract information
    extracted_data = {
        "raw_text": text,
        "email": extract_email(text),
        "phone": extract_phone(text),
        "skills": extract_skills(text),
        "experience": text[:500]  # First 500 chars as experience summary
    }
    
    return extracted_data