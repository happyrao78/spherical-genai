const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const adminRoutes = require('./routes/admin');

const app = express();

// --- CORS Configuration ---
const allowedOrigins = [
  'http://localhost:5173',                  // Allow local client development server
  'http://localhost:5174',                  // Allow local admin development server
  'https://spherical-genai.vercel.app',     // Allow your deployed client app
  'https://spherical-genai-f6eq.vercel.app' // Allow your deployed admin app
  // Add any other origins if needed
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    // Or allow if the origin is in our list
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`); // Log blocked origins
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true // If you need to allow cookies or authorization headers
}));

// --- Middleware ---
app.use(express.json()); // Middleware to parse JSON bodies

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/admin', adminRoutes);

// --- Simple Root Route for Health Check ---
app.get('/', (req, res) => {
  res.send('Server is running');
});

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected successfully.'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    // Exit process on critical connection error during startup?
    // process.exit(1);
  });

mongoose.connection.on('error', err => {
  console.error(`MongoDB runtime error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected.');
});

// --- Server Startup ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => { // Listen on 0.0.0.0 to be accessible externally
  console.log(`Server running smoothly on port ${PORT}`);
});

// --- Graceful Shutdown (Optional but Recommended) ---
process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing MongoDB connection...');
  await mongoose.connection.close();
  console.log('MongoDB connection closed. Exiting.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing MongoDB connection...');
  await mongoose.connection.close();
  console.log('MongoDB connection closed. Exiting.');
  process.exit(0);
});
