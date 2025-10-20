const express = require('express');
const Job = require('../models/Job');
const Application = require('../models/Application');
const User = require('../models/User'); // Ensure User model is imported
const { protect, adminOnly, superAdminOnly } = require('../middleware/auth'); // Import all middlewares
const axios = require('axios'); // Ensure axios is imported

const router = express.Router();

// All routes require admin authentication first
router.use(protect);
router.use(adminOnly); // Then ensure the user is at least a regular admin

// --- Job Routes ---

// Create job (POST /jobs) - Accessible by all admins
router.post('/jobs', async (req, res) => {
  try {
    const { title, company, description, role, salary, requirements } = req.body;

    const job = await Job.create({
      title,
      company,
      description,
      role,
      salary,
      requirements,
      postedBy: req.user._id, // Assign the logged-in admin's ID
    });

    res.status(201).json({ message: 'Job created successfully', job });
  } catch (error) {
    if (error.name === 'ValidationError') {
        return res.status(400).json({ message: 'Validation Error', errors: error.errors });
    }
    console.error('Error creating job:', error);
    res.status(500).json({ message: 'Server error creating job', error: error.message });
  }
});

// Get jobs (admin view) (GET /jobs) - Filtered for regular admins
router.get('/jobs', async (req, res) => {
  try {
    let query = {};
    const isSuperAdmin = req.user.email === process.env.ADMIN_EMAIL;

    // If the logged-in user is NOT the super admin, filter by postedBy
    if (!isSuperAdmin) {
      query.postedBy = req.user._id;
      console.log(`Filtering jobs for regular admin: ${req.user.email}`);
    } else {
        console.log(`Fetching all jobs for super admin: ${req.user.email}`);
    }


    const jobs = await Job.find(query)
      .populate('postedBy', 'name email') // Optionally populate creator details
      .sort({ createdAt: -1 })
      .lean(); // Use lean

    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching admin jobs:', error);
    res.status(500).json({ message: 'Server error fetching jobs', error: error.message });
  }
});

// --- Application Routes ---

// Get applications (GET /applications) - Filtered for regular admins
router.get('/applications', async (req, res) => {
  console.log('Fetching applications for admin...');
  try {
    let applicationFilter = {}; // Filter for the Application query
    const isSuperAdmin = req.user.email === process.env.ADMIN_EMAIL;

    if (!isSuperAdmin) {
      // Find only job IDs posted by the current regular admin
      const adminJobs = await Job.find({ postedBy: req.user._id }).select('_id').lean();
      const adminJobIds = adminJobs.map(job => job._id);
      // Filter applications where the 'job' field is in the list of admin's job IDs
      applicationFilter.job = { $in: adminJobIds };
       console.log(`Filtering applications for regular admin ${req.user.email} based on ${adminJobIds.length} jobs.`);
    } else {
         console.log(`Fetching all applications for super admin ${req.user.email}.`);
    }

    // Fetch applications matching the filter (all for super admin, filtered for regular admin)
    const applications = await Application.find(applicationFilter) // Apply the filter here
      .populate('candidate', 'name email')
      .populate({
            path: 'job',
            select: 'title company description role requirements postedBy', // Include postedBy ID
       })
      .sort({ createdAt: -1 })
      .lean();

    console.log(`Found ${applications.length} applications matching filter.`);

    // --- Batch Score Calculation (remains the same as previous implementation) ---
    if (applications.length === 0) {
      return res.json({ applications: [] });
    }

    // Group applications by candidate ID
    const appsByCandidate = applications.reduce((groups, app) => {
      if (app.candidate && app.candidate._id) {
        const candidateId = app.candidate._id.toString();
        if (!groups[candidateId]) {
          groups[candidateId] = [];
        }
        // Only add if job data is present (it should be after populate)
        if (app.job) {
             groups[candidateId].push(app);
        } else {
             console.warn(`Application ${app._id} skipped for scoring due to missing job data.`);
        }

      }
      return groups;
    }, {});

    console.log(`Grouped applications for ${Object.keys(appsByCandidate).length} candidates for scoring.`);

    const applicationsWithScores = [];
    const pythonApiUrl = process.env.VITE_PYTHON_API_URL || 'http://localhost:8000/api';

    // Process scores for each candidate separately
    for (const candidateId in appsByCandidate) {
      const candidateApps = appsByCandidate[candidateId];
      // console.log(`Processing ${candidateApps.length} apps for candidate ${candidateId}`); // Can be noisy

      const batchPayload = {
        user_id: candidateId,
        jobs: candidateApps
          .map(app => ({ // Already filtered for existing app.job above
            job_id: app.job._id.toString(),
            role: app.job.role,
            description: app.job.description,
            requirements: app.job.requirements || '',
          })),
      };

      if (batchPayload.jobs.length === 0) {
         // This case should ideally not happen due to prior filtering, but good to keep
         console.log(`No valid jobs to score for candidate ${candidateId}, assigning 0 score`);
         candidateApps.forEach(app => applicationsWithScores.push({ ...app, matchScore: 0 }));
         continue;
      }

      try {
        const scoresRes = await axios.post(`${pythonApiUrl}/calculate-batch-job-match`, batchPayload, {
          headers: { Authorization: req.headers.authorization },
        });
        const scoresData = scoresRes.data;

        const scoreMap = scoresData.reduce((map, item) => {
          map[item.job_id] = item.matchScore;
          return map;
        }, {});

        candidateApps.forEach(app => {
          const score = (scoreMap[app.job._id.toString()] !== undefined)
                          ? scoreMap[app.job._id.toString()]
                          : 0;
          applicationsWithScores.push({ ...app, matchScore: score });
        });
        // console.log(`Scores calculated for candidate ${candidateId}`); // Can be noisy

      } catch (error) {
        console.error(`Error calculating batch scores for candidate ${candidateId}:`, error.message);
        candidateApps.forEach(app => applicationsWithScores.push({ ...app, matchScore: 0 }));
      }
    }

    // Re-sort the final list by date as batching might change order
    applicationsWithScores.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log('Applications with scores ready to send.');
    res.json({ applications: applicationsWithScores });

  } catch (error) {
    console.error('Error fetching admin applications:', error);
    res.status(500).json({ message: 'Server error fetching applications', error: error.message });
  }
});

// Update application status (PUT /applications/:id) - Accessible by all admins (consider scoping later if needed)
router.put('/applications/:id', async (req, res) => {
    // Note: This currently allows any admin to update status for any application they can see.
    // If you need to restrict this to only the admin who posted the job, you'd add a check here
    // comparing req.user._id to the application's job.postedBy field.
  try {
    const { status } = req.body;
    if (!['pending', 'reviewed', 'accepted', 'rejected'].includes(status)) {
         return res.status(400).json({ message: 'Invalid status value' });
    }

    const application = await Application.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true } // Return the updated document
    ).lean(); // Use lean

     if (!application) {
        return res.status(404).json({ message: 'Application not found' });
     }


    // Optional: Add check here if needed:
    // const job = await Job.findById(application.job).select('postedBy').lean();
    // if (req.user.email !== process.env.ADMIN_EMAIL && job.postedBy.toString() !== req.user._id.toString()) {
    //    return res.status(403).json({ message: 'Cannot update status for job posted by another admin.' });
    // }


    res.json({ message: 'Application updated', application });
  } catch (error) {
     console.error('Error updating application status:', error);
    res.status(500).json({ message: 'Server error updating application', error: error.message });
  }
});


// --- Candidate/User Routes ---

// Get candidates who have uploaded resumes (GET /candidates-with-resumes) - Accessible by all admins
router.get('/candidates-with-resumes', async (req, res) => {
  console.log('Fetching candidates with resumes...');
  try {
    const pythonApiUrl = process.env.VITE_PYTHON_API_URL || 'http://localhost:8000/api';
    let userIds = [];
    try {
      const pythonRes = await axios.get(`${pythonApiUrl}/admin/resumes/user-ids`, {
        headers: { Authorization: req.headers.authorization },
      });
      userIds = pythonRes.data || [];
      console.log(`Received ${userIds.length} user IDs from Python service.`);
    } catch (pyError) {
      console.error('Error fetching user IDs from Python service:', pyError.message);
    }

    if (userIds.length === 0) {
      return res.json({ candidates: [] });
    }

    const candidates = await User.find({
      _id: { $in: userIds },
      role: 'candidate',
    })
    .select('name email createdAt')
    .sort({ createdAt: -1 })
    .lean();

    console.log(`Found ${candidates.length} candidate details in Node DB.`);
    res.json({ candidates });
  } catch (error) {
    console.error('Error fetching candidates with resumes:', error);
    res.status(500).json({ message: 'Server error fetching candidates', error: error.message });
  }
});

// --- Super Admin Only Routes ---

// Promote User to Admin (POST /users/promote/:userId) - Super Admin Only
router.post('/users/promote/:userId', superAdminOnly, async (req, res) => {
  try {
    const userIdToPromote = req.params.userId;
    const user = await User.findById(userIdToPromote);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.email === process.env.ADMIN_EMAIL || user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot promote this user' });
    }

    user.role = 'admin';
    await user.save();

    console.log(`User ${user.email} promoted to admin by ${req.user.email}`);
    // Return lean user object without sensitive fields
    const promotedUserInfo = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
    };
    res.json({ message: 'User successfully promoted to admin', user: promotedUserInfo });

  } catch (error) {
    console.error('Error promoting user:', error);
    res.status(500).json({ message: 'Server error promoting user', error: error.message });
  }
});

// Get candidate users for promotion list (GET /users/candidates) - Super Admin Only
 router.get('/users/candidates', superAdminOnly, async (req, res) => {
   try {
     const candidates = await User.find({ role: 'candidate' })
       .select('name email _id createdAt') // Include _id
       .sort({ name: 1 })
       .lean();
     res.json({ candidates });
   } catch (error) {
     console.error('Error fetching candidates for promotion:', error);
     res.status(500).json({ message: 'Server error fetching candidates' });
   }
 });


module.exports = router;