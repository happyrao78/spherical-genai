const express = require('express');
const Job = require('../models/Job');
const Application = require('../models/Application');
const User = require('../models/User');
const Profile = require('../models/Profile'); // Make sure to import the Profile model
const { protect, adminOnly, superAdminOnly } = require('../middleware/auth');
const axios = require('axios');
const bcrypt = require('bcryptjs');

const router = express.Router();

// All routes require admin authentication first
router.use(protect);
router.use(adminOnly);

// --- Job Routes ---
// (No changes needed in Job routes, keeping them for completeness)
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
      postedBy: req.user._id,
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

router.get('/jobs', async (req, res) => {
  try {
    let query = {};
    const isSuperAdmin = req.user.email === process.env.ADMIN_EMAIL;
    if (!isSuperAdmin) {
      query.postedBy = req.user._id;
    }
    const jobs = await Job.find(query)
      .populate('postedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching admin jobs:', error);
    res.status(500).json({ message: 'Server error fetching jobs', error: error.message });
  }
});


// --- Application Routes ---
router.get('/applications', async (req, res) => {
  try {
    let applicationFilter = {};
    const isSuperAdmin = req.user.email === process.env.ADMIN_EMAIL;

    if (!isSuperAdmin) {
      const adminJobs = await Job.find({ postedBy: req.user._id }).select('_id').lean();
      const adminJobIds = adminJobs.map(job => job._id);
      applicationFilter.job = { $in: adminJobIds };
    }

    let applications = await Application.find(applicationFilter)
      .populate('candidate', 'name email')
      .populate({
            path: 'job',
            select: 'title company description role requirements postedBy',
       })
      .sort({ createdAt: -1 })
      .lean();

    // ========= START: NEW LOGIC TO ADD RESUME URL =========
    if (applications.length > 0) {
        const candidateIds = applications.map(app => app.candidate?._id.toString()).filter(id => id);
        
        const profiles = await Profile.find({ user_id: { $in: candidateIds } }).select('user_id resume_url').lean();
        
        const profileMap = profiles.reduce((map, profile) => {
          if (profile.user_id) {
            map[profile.user_id] = profile.resume_url;
          }
          return map;
        }, {});
        
        // Add resumeUrl to each application object
        applications = applications.map(app => {
          if (app.candidate) {
            return {
              ...app,
              resumeUrl: profileMap[app.candidate._id.toString()] || null,
            };
          }
          return app;
        });
    }
    // ========= END: NEW LOGIC TO ADD RESUME URL =========


    if (applications.length === 0) {
      return res.json({ applications: [] });
    }

    const appsByCandidate = applications.reduce((groups, app) => {
      if (app.candidate && app.candidate._id) {
        const candidateId = app.candidate._id.toString();
        if (!groups[candidateId]) {
          groups[candidateId] = [];
        }
        if (app.job) {
             groups[candidateId].push(app);
        }
      }
      return groups;
    }, {});

    const applicationsWithScores = [];
    const pythonApiUrl = process.env.VITE_PYTHON_API_URL || 'http://localhost:8000/api';

    for (const candidateId in appsByCandidate) {
      const candidateApps = appsByCandidate[candidateId];
      const batchPayload = {
        user_id: candidateId,
        jobs: candidateApps.map(app => ({
            job_id: app.job._id.toString(),
            role: app.job.role,
            description: app.job.description,
            requirements: app.job.requirements || '',
          })),
      };

      if (batchPayload.jobs.length === 0) {
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

      } catch (error) {
        console.error(`Error calculating batch scores for candidate ${candidateId}:`, error.message);
        candidateApps.forEach(app => applicationsWithScores.push({ ...app, matchScore: 0 }));
      }
    }

    applicationsWithScores.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ applications: applicationsWithScores });

  } catch (error) {
    console.error('Error fetching admin applications:', error);
    res.status(500).json({ message: 'Server error fetching applications', error: error.message });
  }
});


// (No changes needed in other routes, keeping them for completeness)
router.put('/applications/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'reviewed', 'accepted', 'rejected'].includes(status)) {
         return res.status(400).json({ message: 'Invalid status value' });
    }
    const application = await Application.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).lean();
     if (!application) {
        return res.status(404).json({ message: 'Application not found' });
     }
    res.json({ message: 'Application updated', application });
  } catch (error) {
     console.error('Error updating application status:', error);
    res.status(500).json({ message: 'Server error updating application', error: error.message });
  }
});

router.get('/candidates-with-resumes', async (req, res) => {
  try {
    const pythonApiUrl = process.env.VITE_PYTHON_API_URL || 'http://localhost:8000/api';
    let userIds = [];
    try {
      const pythonRes = await axios.get(`${pythonApiUrl}/admin/resumes/user-ids`, {
        headers: { Authorization: req.headers.authorization },
      });
      userIds = pythonRes.data || [];
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
    res.json({ candidates });
  } catch (error) {
    console.error('Error fetching candidates with resumes:', error);
    res.status(500).json({ message: 'Server error fetching candidates', error: error.message });
  }
});

// --- Super Admin Only Routes ---
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

 router.get('/users/candidates', superAdminOnly, async (req, res) => {
   try {
     const candidates = await User.find({ role: 'candidate' })
       .select('name email _id createdAt')
       .sort({ name: 1 })
       .lean();
     res.json({ candidates });
   } catch (error) {
     console.error('Error fetching candidates for promotion:', error);
     res.status(500).json({ message: 'Server error fetching candidates' });
   }
 });

router.post('/users/create-admin', superAdminOnly, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Please provide name, email, and password' });
  }
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'admin',
      isVerified: true,
    });
    res.status(201).json({ message: 'Admin user created successfully' });
  } catch (error) {
    console.error('Error creating admin user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/users/demote/:userId', superAdminOnly, async (req, res) => {
  try {
    const userIdToDemote = req.params.userId;
    const user = await User.findById(userIdToDemote);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.email === process.env.ADMIN_EMAIL) {
      return res.status(400).json({ message: 'Cannot demote the super admin' });
    }
    if (user.role !== 'admin') {
      return res.status(400).json({ message: 'User is not an admin' });
    }
    user.role = 'candidate';
    await user.save();
    res.json({ message: 'User successfully demoted to candidate' });
  } catch (error) {
    console.error('Error demoting user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/users/admins', superAdminOnly, async (req, res) => {
  try {
    const admins = await User.find({
      role: 'admin',
      email: { $ne: process.env.ADMIN_EMAIL }
    }).select('name email _id').lean();
    res.json({ admins });
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;