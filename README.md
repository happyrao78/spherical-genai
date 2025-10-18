Start script :

Go to each directory & run the below mentioned commands

ADMIN :
1. set up env:
    VITE_NODE_API_URL=http://localhost:5000/api
    VITE_PYTHON_API_URL=http://localhost:8000/api

2. npm install 
3. npm run dev

CLIENT:
1. env : 
    VITE_NODE_API_URL=http://localhost:5000/api
    VITE_PYTHON_API_URL=http://localhost:8000/api
2. npm install 
3. npm run dev

SERVER:
1. env :
    PORT=5000
    MONGODB_URI=""
    JWT_SECRET=
    EMAIL_USER="enter email with which the emails will go for otp"
    EMAIL_PASS="enter app password"
    ADMIN_EMAIL="enter email for admin access and otp will be  shared "
    ADMIN_PASSWORD="password"

2. npm install 
3. npm run dev

SERVICE:
1. setup env :
    MONGODB_URI=""
    JWT_SECRET=
    PINECONE_API_KEY=
    PINECONE_ENVIRONMENT=
    PINECONE_INDEX_NAME=
    GEMINI_API_KEY=

2. setup virtual env
3. pip install -r requirements.txt
4. run command : python main.py
