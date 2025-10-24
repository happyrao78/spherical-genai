const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const adminRoutes = require('./routes/admin');

const app = express();

// --- CORS Configuration ---
// NOTE: Do not include URL paths (like /login) in allowed origins. Origins are scheme + host [+ port].
const allowedOrigins = [
  'http://localhost:5173',                  // local client dev
  'http://localhost:5174',                  // local admin dev
  'https://spherical-genai.vercel.app',     // deployed client
  'https://spherical-genai-f6eq.vercel.app',// deployed admin variant
  'https://spherical-genai-candidate.vercel.app',
  'https://spherical-genai-employer.vercel.app'
];

// Allow wildcard subdomains on vercel (if you have many preview domains) by checking hostname endsWith
function isAllowedOrigin(origin) {
  if (!origin) return true; // allow server-to-server, curl, mobile (no origin)
  try {
    const url = new URL(origin);
    const host = url.hostname;
    // Allow exact matches
    if (allowedOrigins.includes(origin)) return true;
    // Allow preview/deploy subdomains that end with '.vercel.app'
    if (host.endsWith('.vercel.app')) return true;
    return false;
  } catch (e) {
    return false;
  }
}

app.use(cors({
  origin: function (origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    console.warn(`CORS blocked request from origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
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
