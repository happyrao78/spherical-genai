const express = require('express');
const Job = require('../models/Job');
const Application = require('../models/Application');
const User = require('../models/User');
const Profile = require('../models/Profile'); // Ensure Profile model is imported
const { protect, adminOnly, superAdminOnly } = require('../middleware/auth');
const axios = require('axios');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Apply authentication and admin role checks to all routes in this file
router.use(protect);
router.use(adminOnly);

// --- Application Routes ---
router.get('/applications', async (req, res) => {
  console.log("\n[SERVER] /admin/applications: Request received.");
  try {
    // **Declare applicationFilter here with a default value**
    let applicationFilter = {};

    // Only apply the filter if the user is NOT the super admin
    if (req.user.email !== process.env.ADMIN_EMAIL) {
      console.log("[SERVER-DEBUG] /admin/applications: Non-super admin detected. Filtering jobs.");
      const adminJobs = await Job.find({ postedBy: req.user._id }).select('_id').lean();
      const adminJobIds = adminJobs.map(job => job._id);
      applicationFilter.job = { $in: adminJobIds };
    } else {
      console.log("[SERVER-DEBUG] /admin/applications: Super admin detected. No job filter applied.");
    }

    // Fetch applications, populating necessary details
    let applications = await Application.find(applicationFilter) // Now applicationFilter always exists
      .populate('candidate', 'name email') // Get candidate name and email
      .populate({
        path: 'job',
        select: 'title postedBy', // Select title and postedBy from Job
        populate: { path: 'postedBy', select: 'name' } // Populate postedBy within Job
      })
      .sort({ createdAt: -1 })
      .lean(); // Use lean for performance as we modify the objects

    console.log(`[SERVER-DEBUG] /admin/applications: Found ${applications.length} raw applications matching filter.`);

    // --- START: Fetch and Merge Resume URLs ---
    if (applications.length > 0) {
      // Get unique, valid candidate IDs
      const candidateIds = [
        ...new Set( // Use Set to get unique IDs
          applications
            .map(app => app.candidate?._id?.toString()) // Safely access _id and convert to string
            .filter(id => id) // Filter out any null/undefined IDs
        )
      ];

      console.log(`[SERVER-DEBUG] /admin/applications: Extracted ${candidateIds.length} unique candidate IDs for profile lookup:`, candidateIds);

      if (candidateIds.length > 0) {
        // Fetch corresponding profiles
        const profiles = await Profile.find({ user_id: { $in: candidateIds } })
          .select('user_id resume_url')
          .lean();
        console.log(`[SERVER-DEBUG] /admin/applications: Found ${profiles.length} profiles for these candidates.`);

        // Create a map for efficient lookup
        const profileMap = profiles.reduce((map, profile) => {
          map[profile.user_id] = profile.resume_url;
          return map;
        }, {});
        console.log(`[SERVER-DEBUG] /admin/applications: Created profileMap.`);

        // Merge the resumeUrl into each application
        applications = applications.map(app => {
          const candidateIdString = app.candidate?._id?.toString();
          const resumeUrl = candidateIdString ? profileMap[candidateIdString] || null : null;
          console.log(`[SERVER-DEBUG] /admin/applications: App ID ${app._id}, Candidate ID ${candidateIdString}, Found resumeUrl: ${resumeUrl ? 'Yes' : 'No'}`);
          return { ...app, resumeUrl };
        });
        console.log("[SERVER-DEBUG] /admin/applications: Finished merging resume URLs.");
      } else {
        console.log("[SERVER-DEBUG] /admin/applications: No valid candidate IDs found in applications to fetch profiles for.");
        // Ensure resumeUrl is at least null if no candidates
        applications = applications.map(app => ({ ...app, resumeUrl: null }));
      }
    } else {
      console.log("[SERVER-DEBUG] /admin/applications: No applications found to process.");
    }
    // --- END: Fetch and Merge Resume URLs ---
    console.log(">>> FINAL Applications Data:", JSON.stringify(applications, null, 2));
    res.json({ applications });

  } catch (error) {
    console.error('[SERVER] Error fetching admin applications:', error);
    res.status(500).json({ message: 'Server error fetching applications', error: error.message });
  }
});

// --- Job Routes ---
router.post('/jobs', async (req, res) => {
  console.log("\n[SERVER] Received request POST /admin/jobs");
  try {
    const { title, company, description, role, salary, requirements } = req.body;
    if (!title || !company || !description || !role || !salary) {
      console.warn("[SERVER-WARN] /admin/jobs: Missing required fields in request body:", req.body);
      return res.status(400).json({ message: 'Missing required job fields: title, company, description, role, salary' });
    }
    const job = await Job.create({
      title,
      company,
      description,
      role,
      salary,
      requirements,
      postedBy: req.user._id // Associate job with the logged-in admin
    });
    console.log(`[SERVER-INFO] /admin/jobs: Job created successfully with ID: ${job._id}`);
    res.status(201).json({ message: 'Job created successfully', job });
  } catch (error) {
    console.error('[SERVER] Error creating job:', error);
    res.status(500).json({ message: 'Server error creating job', error: error.message });
  }
});

router.get('/jobs', async (req, res) => {
  console.log("\n[SERVER] Received request GET /admin/jobs");
  try {
    let query = {};
    // Super admin sees all jobs, other admins see only their own
    if (req.user.email !== process.env.ADMIN_EMAIL) {
      console.log(`[SERVER-DEBUG] /admin/jobs: Filtering jobs for admin: ${req.user.email}`);
      query.postedBy = req.user._id;
    } else {
      console.log(`[SERVER-DEBUG] /admin/jobs: Super admin detected. Fetching all jobs.`);
    }
    const jobs = await Job.find(query)
      .populate('postedBy', 'name email') // Populate creator details
      .sort({ createdAt: -1 })
      .lean();
    console.log(`[SERVER-INFO] /admin/jobs: Fetched ${jobs.length} jobs.`);
    res.json({ jobs });
  } catch (error) {
    console.error('[SERVER] Error fetching admin jobs:', error);
    res.status(500).json({ message: 'Server error fetching jobs', error: error.message });
  }
});

// --- Candidate Info Route ---
router.get('/candidates-with-resumes', async (req, res) => {
  console.log("\n[SERVER] Received request for /admin/candidates-with-resumes");
  try {
    // 1. Get user_ids from Python service if configured.
    const pythonApiUrl = process.env.VITE_PYTHON_API_URL; // do NOT default to localhost in production
    let userIdsFromPython = [];

    if (pythonApiUrl) {
      try {
        console.log(`[SERVER-DEBUG] /admin/candidates-with-resumes: Calling Python service at ${pythonApiUrl}/admin/resumes/user-ids`);
        const pythonRes = await axios.get(`${pythonApiUrl.replace(/\/$/, '')}/admin/resumes/user-ids`, { headers: { Authorization: req.headers.authorization } });
        userIdsFromPython = pythonRes.data || [];
        console.log(`[SERVER-DEBUG] /admin/candidates-with-resumes: Fetched ${userIdsFromPython.length} user IDs from Python.`);
      } catch (err) {
        console.error('[SERVER-WARN] /admin/candidates-with-resumes: Error calling Python service, falling back to DB lookup.', err.message || err);
        userIdsFromPython = [];
      }
    } else {
      console.log('[SERVER-DEBUG] /admin/candidates-with-resumes: No Python API URL configured (VITE_PYTHON_API_URL). Falling back to DB lookup.');
    }

    // If python service returned none, fall back to distinct user_ids from Profile collection
    if (!userIdsFromPython || userIdsFromPython.length === 0) {
      console.log("[SERVER-DEBUG] /admin/candidates-with-resumes: No user IDs from Python; fetching distinct user_ids from Profile collection as fallback.");
      try {
        const distinctIds = await Profile.find({ resume_url: { $exists: true, $ne: '' } }).distinct('user_id');
        userIdsFromPython = distinctIds.map(id => id.toString());
        console.log(`[SERVER-DEBUG] /admin/candidates-with-resumes: Found ${userIdsFromPython.length} user IDs from Profile fallback.`);
      } catch (err) {
        console.error('[SERVER-ERROR] /admin/candidates-with-resumes: Error fetching distinct user_ids from Profile collection:', err.message || err);
        return res.status(500).json({ message: 'Server error fetching candidates', error: err.message });
      }
    }

    // 2. Fetch User details for these IDs
    const candidates = await User.find({ _id: { $in: userIdsFromPython }, role: 'candidate' }) // Ensure role is candidate
      .select('name email createdAt')
      .sort({ createdAt: -1 })
      .lean();
    console.log(`[SERVER-DEBUG] /admin/candidates-with-resumes: Found ${candidates.length} User documents matching IDs and role.`);

    // --- START: Fetch and Merge Resume URLs ---
    // 3. Get the string IDs from the found candidates for the Profile query
    const candidateIdsForProfileQuery = candidates.map(c => c._id.toString());

    if (candidateIdsForProfileQuery.length === 0) {
      console.log("[SERVER-DEBUG] /admin/candidates-with-resumes: No candidate users found in DB for Python IDs.");
      return res.json({ candidates: [] });
    }
    console.log(`[SERVER-DEBUG] /admin/candidates-with-resumes: User IDs for profile query:`, candidateIdsForProfileQuery);

    // 4. Fetch corresponding Profiles using user_id string
    const profiles = await Profile.find({ user_id: { $in: candidateIdsForProfileQuery } })
      .select('user_id resume_url')
      .lean();
    console.log(`[SERVER-DEBUG] /admin/candidates-with-resumes: Found ${profiles.length} profiles for these users.`);

    // 5. Create a map for easy lookup (userId -> resumeUrl)
    const profileMap = profiles.reduce((map, profile) => {
      map[profile.user_id] = profile.resume_url;
      return map;
    }, {});
    console.log(`[SERVER-DEBUG] /admin/candidates-with-resumes: Created profileMap.`);

    // 6. Add resumeUrl to each candidate object
    const candidatesWithResumes = candidates.map(candidate => {
      const resumeUrl = profileMap[candidate._id.toString()] || null;
      console.log(`[SERVER-DEBUG] /admin/candidates-with-resumes: Candidate ID ${candidate._id.toString()}, Found resumeUrl: ${resumeUrl ? 'Yes' : 'No'}`);
      return { ...candidate, resumeUrl };
    });
    console.log("[SERVER-DEBUG] /admin/candidates-with-resumes: Finished merging resume URLs.");
    // --- END: Fetch and Merge Resume URLs ---
    console.log(">>> FINAL Candidates Data:", JSON.stringify(candidatesWithResumes, null, 2));

    res.json({ candidates: candidatesWithResumes }); // Send the merged data

  } catch (error) {
    console.error('[SERVER] Error fetching candidates with resumes:', error);
    // Provide more detailed error response, especially for connection errors
    if (error.code === 'ECONNREFUSED') {
      console.error('[SERVER-FATAL] /admin/candidates-with-resumes: Connection to Python service refused. Is the Python service running?');
      return res.status(503).json({ message: 'Service unavailable: Cannot connect to resume service.' });
    }
    res.status(500).json({
      message: 'Server error fetching candidates',
      error: error.message,
      code: error.code, // Include error code if available
      response: error.response?.data // Include Python API error if available
    });
  }
});


// --- Super Admin User Management Routes ---

// Get Candidate Users (for potential promotion - REMOVED, keep for viewing maybe?)
router.get('/users/candidates', superAdminOnly, async (req, res) => {
  console.log("\n[SERVER] Received request GET /admin/users/candidates");
  try {
    const candidates = await User.find({ role: 'candidate' })
      .select('name email _id createdAt') // Added createdAt
      .sort({ name: 1 })
      .lean();
    console.log(`[SERVER-INFO] /admin/users/candidates: Fetched ${candidates.length} candidates.`);
    res.json({ candidates });
  } catch (error) {
    console.error('[SERVER] Error fetching candidate users:', error);
    res.status(500).json({ message: 'Server error fetching candidates', error: error.message });
  }
});

// Create a New Admin Directly
router.post('/users/create-admin', superAdminOnly, async (req, res) => {
  console.log("\n[SERVER] Received request POST /admin/users/create-admin");
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    console.warn("[SERVER-WARN] /admin/users/create-admin: Missing required fields:", req.body);
    return res.status(400).json({ message: 'Missing required fields: name, email, password' });
  }
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.warn(`[SERVER-WARN] /admin/users/create-admin: User already exists with email: ${email}`);
      return res.status(400).json({ message: 'User already exists with this email.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'admin',
      isVerified: true // Admins created directly are considered verified
    });
    console.log(`[SERVER-INFO] /admin/users/create-admin: Admin created successfully: ${email} (ID: ${newAdmin._id})`);
    res.status(201).json({ message: 'Admin created successfully.' });
  } catch (error) {
    console.error('[SERVER] Error creating admin:', error);
    res.status(500).json({ message: 'Server error creating admin.', error: error.message });
  }
});

// Get Current Admins (excluding the super admin)
router.get('/users/admins', superAdminOnly, async (req, res) => {
  console.log("\n[SERVER] Received request GET /admin/users/admins");
  try {
    // Find admins whose email does not match the super admin email
    const admins = await User.find({ role: 'admin', email: { $ne: process.env.ADMIN_EMAIL } })
      .select('name email _id') // Select only necessary fields
      .lean();
    console.log(`[SERVER-INFO] /admin/users/admins: Fetched ${admins.length} non-super admins.`);
    res.json({ admins });
  } catch (error) {
    console.error('[SERVER] Error fetching admins:', error);
    res.status(500).json({ message: 'Server error fetching admins', error: error.message });
  }
});
module.exports = router;