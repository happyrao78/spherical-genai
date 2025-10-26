const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Helper to format user response
const formatUserResponse = (user) => {
  const isSuper = user.email === process.env.ADMIN_EMAIL && user.role === 'admin';
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    isSuperAdmin: isSuper,
  };
};

// Email transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', // Explicitly define the secure host
  port: 465,              // Explicitly use the secure port
  secure: true,           // Enforce SSL/TLS for port 465 connection
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// -------------------- USER ROUTES --------------------

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      otp,
      otpExpiry,
    });

    // Send OTP email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify your email - Spherical',
      text: `Your OTP is: ${otp}. Valid for 10 minutes.`,
    });

    res.status(201).json({ message: 'User created. Please verify your email.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.otp !== otp || user.otpExpiry < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    if (!user.isVerified) return res.status(401).json({ message: 'Please verify your email first' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get current user
router.get('/me', protect, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }
  res.json({ user: formatUserResponse(req.user) });
});

// -------------------- ADMIN ROUTES --------------------

// Admin request OTP (create default admin if not exists)
router.post('/admin/request-otp', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if admin exists
    let admin = await User.findOne({ email, role: 'admin' });

    if (admin) {
      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
    } else {
      // Create default admin if credentials match env
      if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        const hashedPassword = await bcrypt.hash(password, 10);
        admin = await User.create({
          name: 'Admin',
          email,
          password: hashedPassword,
          role: 'admin',
          isVerified: true,
        });
      } else {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    admin.otp = otp;
    admin.otpExpiry = otpExpiry;
    await admin.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Admin Login OTP - Spherical',
      text: `Your OTP is: ${otp}. Valid for 10 minutes.`,
    });

    res.json({ message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Error in /admin/request-otp:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Admin verify OTP
router.post('/admin/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const admin = await User.findOne({ email, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    if (admin.otp !== otp || admin.otpExpiry < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    admin.otp = undefined;
    admin.otpExpiry = undefined;
    await admin.save();

    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: formatUserResponse(admin),
    });
  } catch (error) {
    console.error('Error in /admin/verify-otp:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
