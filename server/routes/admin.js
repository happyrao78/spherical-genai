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

    console.log(`[SERVER-DEBUG] Found ${applications.length} applications in the database.`);

    // --- START: Fetch and Merge Resume URLs ---
    if (applications.length > 0) {
      // 1. Get all the candidate IDs from the applications
      const candidateIds = applications.map(app => app.candidate?._id.toString()).filter(id => id);
      console.log(`[SERVER-DEBUG] Extracted ${candidateIds.length} candidate IDs to find their profiles.`);

      // 2. Find all matching profiles in the 'profiles' collection
      const profiles = await Profile.find({ user_id: { $in: candidateIds } }).select('user_id resume_url').lean();
      console.log(`[SERVER-DEBUG] Found ${profiles.length} profiles with resume URLs.`);

        // Create a map for efficient lookup
        const profileMap = profiles.reduce((map, profile) => {
          map[profile.user_id] = profile.resume_url;
          return map;
        }, {});
        console.log(`[SERVER-DEBUG] /admin/applications: Created profileMap.`);

      // 4. Add the 'resumeUrl' to each application object
      applications = applications.map(app => {
        const resumeUrl = app.candidate ? profileMap[app.candidate._id.toString()] || null : null;
        return { ...app, resumeUrl };
      });
      console.log("[SERVER-DEBUG] Successfully merged resume URLs into the application data.");
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

// CREATE Job (POST) - (Already exists)
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

// READ Jobs (GET) - (Already exists)
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

// ==========================================================
// ===== START: NEW CODE FOR JOB UPDATE (PUT) =====
// ==========================================================
router.put('/jobs/:id', async (req, res) => {
  const { id } = req.params;
  const { title, company, description, role, salary, requirements } = req.body;
  console.log(`\n[SERVER] Received request PUT /admin/jobs/${id}`);

  try {
    const job = await Job.findById(id);

    if (!job) {
      console.warn(`[SERVER-WARN] /admin/jobs/${id}: Job not found.`);
      return res.status(404).json({ message: 'Job not found' });
    }

    // Security Check: Allow if user is Super Admin OR user is the one who posted the job
    const isSuperAdmin = req.user.email === process.env.ADMIN_EMAIL;
    const isOwner = job.postedBy.toString() === req.user._id.toString();

    if (!isSuperAdmin && !isOwner) {
      console.warn(`[SERVER-WARN] /admin/jobs/${id}: Forbidden. User ${req.user.email} is not owner or super admin.`);
      return res.status(403).json({ message: 'Not authorized to update this job' });
    }
    
    // Update the job
    const updatedJob = await Job.findByIdAndUpdate(
      id,
      { title, company, description, role, salary, requirements },
      { new: true, runValidators: true } // Return the updated document and run schema validators
    );

    console.log(`[SERVER-INFO] /admin/jobs/${id}: Job updated successfully.`);
    res.json({ message: 'Job updated successfully', job: updatedJob });

  } catch (error) {
    console.error(`[SERVER-ERROR] /admin/jobs/${id}:`, error);
    res.status(500).json({ message: 'Server error updating job', error: error.message });
  }
});
// ==========================================================
// ===== END: NEW CODE FOR JOB UPDATE (PUT) =====
// ==========================================================


// ==========================================================
// ===== START: NEW CODE FOR JOB DELETE (DELETE) =====
// ==========================================================
router.delete('/jobs/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`\n[SERVER] Received request DELETE /admin/jobs/${id}`);

  try {
    const job = await Job.findById(id);

    if (!job) {
      console.warn(`[SERVER-WARN] /admin/jobs/${id}: Job not found.`);
      return res.status(404).json({ message: 'Job not found' });
    }

    // Security Check: Allow if user is Super Admin OR user is the one who posted the job
    const isSuperAdmin = req.user.email === process.env.ADMIN_EMAIL;
    const isOwner = job.postedBy.toString() === req.user._id.toString();

    if (!isSuperAdmin && !isOwner) {
      console.warn(`[SERVER-WARN] /admin/jobs/${id}: Forbidden. User ${req.user.email} is not owner or super admin.`);
      return res.status(403).json({ message: 'Not authorized to delete this job' });
    }

    // Optional: Delete all applications for this job first
    await Application.deleteMany({ job: id });
    console.log(`[SERVER-DEBUG] /admin/jobs/${id}: Deleted associated applications.`);

    // Delete the job
    await Job.findByIdAndDelete(id);

    console.log(`[SERVER-INFO] /admin/jobs/${id}: Job deleted successfully.`);
    res.json({ message: 'Job deleted successfully' });

  } catch (error) {
    console.error(`[SERVER-ERROR] /admin/jobs/${id}:`, error);
    res.status(500).json({ message: 'Server error deleting job', error: error.message });
  }
});
// ==========================================================
// ===== END: NEW CODE FOR JOB DELETE (DELETE) =====
// ==========================================================


// --- Candidate Info Route ---
router.get('/candidates-with-resumes', async (req, res) => {
  try {
    // 1. Get user_ids from Python service (existing code)
    const pythonApiUrl = process.env.VITE_PYTHON_API_URL || 'http://localhost:8000/api';
    const pythonRes = await axios.get(`${pythonApiUrl}/admin/resumes/user-ids`, { headers: { Authorization: req.headers.authorization } });
    const userIdsFromPython = pythonRes.data || [];
    console.log(`[SERVER-DEBUG] Fetched ${userIdsFromPython.length} user IDs with resumes from Python service.`);

    if (userIdsFromPython.length === 0) {
      console.log("[SERVER-DEBUG] No user IDs found, returning empty candidates list.");
      return res.json({ candidates: [] });
    }

    // 2. Fetch User details for these IDs (existing code, adjusted)
    // Convert userIdsFromPython (strings) to ObjectId for User query if necessary, though comparing strings might work too.
    // Let's fetch using the string IDs first, then adjust if needed.
    const candidates = await User.find({ _id: { $in: userIdsFromPython } }) // Querying User model by _id
                                 .select('name email createdAt')
                                 .sort({ createdAt: -1 })
                                 .lean();
    console.log(`[SERVER-DEBUG] Found ${candidates.length} User documents matching the IDs.`);


    // --- START: ADDED CODE TO FETCH RESUME URLS ---
    // 3. Fetch corresponding Profiles using user_id (which matches User._id as string)
    const profiles = await Profile.find({ user_id: { $in: userIdsFromPython } }) // Querying Profile model by user_id string
                                  .select('user_id resume_url')
                                  .lean();
    console.log(`[SERVER-DEBUG] Found ${profiles.length} Profile documents with resume URLs.`);

    // 5. Create a map for easy lookup (userId -> resumeUrl)
    const profileMap = profiles.reduce((map, profile) => {
      map[profile.user_id] = profile.resume_url;
      return map;
    }, {});
    console.log(`[SERVER-DEBUG] /admin/candidates-with-resumes: Created profileMap.`);

    // 5. Add resumeUrl to each candidate object
    const candidatesWithResumes = candidates.map(candidate => ({
      ...candidate,
      resumeUrl: profileMap[candidate._id.toString()] || null // Convert candidate._id to string for lookup
    }));
    console.log("[SERVER-DEBUG] Successfully merged resume URLs into candidates data.");
    // --- END: ADDED CODE ---

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

// Recalculate match score for a specific application
router.post('/applications/:id/recalculate-score', async (req, res) => {
  const applicationId = req.params.id;
  console.log(`\n[SERVER] POST /admin/applications/${applicationId}/recalculate-score`);

  try {
    const application = await Application.findById(applicationId)
      .populate('candidate', '_id')
      .populate('job', 'role description requirements');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check authorization (only if needed for non-super admin)
    if (req.user.email !== process.env.ADMIN_EMAIL) {
      const job = await Job.findById(application.job._id);
      if (!job || job.postedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized' });
      }
    }

    // Calculate fresh score
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:8000/api';
    const scorePayload = {
      user_id: application.candidate._id.toString(),
      job_data: {
        role: application.job.role,
        description: application.job.description,
        requirements: application.job.requirements || ''
      }
    };

    const scoreRes = await axios.post(
      `${pythonApiUrl}/calculate-job-match`,
      scorePayload,
      { headers: { Authorization: req.headers.authorization }, timeout: 30000 }
    );

    const newScore = scoreRes.data.matchScore || 0;

    // Update application with new score
    application.matchScore = newScore;
    await application.save();

    console.log(`[SERVER-INFO] Score recalculated for application ${applicationId}: ${newScore}`);
    res.json({ message: 'Score recalculated successfully', matchScore: newScore });

  } catch (error) {
    console.error(`[SERVER-ERROR] Error recalculating score:`, error);
    res.status(500).json({ 
      message: 'Error recalculating score', 
      error: error.message 
    });
  }
});

// Bulk recalculate scores for all applications of a job
router.post('/jobs/:jobId/recalculate-all-scores', async (req, res) => {
  const jobId = req.params.jobId;
  console.log(`\n[SERVER] POST /admin/jobs/${jobId}/recalculate-all-scores`);

  try {
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Check authorization
    if (req.user.email !== process.env.ADMIN_EMAIL) {
      if (job.postedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized' });
      }
    }

    const applications = await Application.find({ job: jobId })
      .populate('candidate', '_id');

    console.log(`[SERVER-DEBUG] Found ${applications.length} applications to recalculate`);

    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:8000/api';
    let successCount = 0;

    for (const app of applications) {
      try {
        const scorePayload = {
          user_id: app.candidate._id.toString(),
          job_data: {
            role: job.role,
            description: job.description,
            requirements: job.requirements || ''
          }
        };

        const scoreRes = await axios.post(
          `${pythonApiUrl}/calculate-job-match`,
          scorePayload,
          { headers: { Authorization: req.headers.authorization }, timeout: 30000 }
        );

        app.matchScore = scoreRes.data.matchScore || 0;
        await app.save();
        successCount++;
      } catch (err) {
        console.error(`[SERVER-ERROR] Failed to recalculate score for application ${app._id}:`, err.message);
      }
    }

    console.log(`[SERVER-INFO] Recalculated ${successCount}/${applications.length} scores for job ${jobId}`);
    res.json({ 
      message: 'Scores recalculated', 
      total: applications.length, 
      success: successCount 
    });

  } catch (error) {
    console.error(`[SERVER-ERROR] Error in bulk recalculation:`, error);
    res.status(500).json({ message: 'Error recalculating scores', error: error.message });
  }
});

module.exports = router;