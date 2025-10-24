const express = require('express');
const Job = require('../models/Job');
const Application = require('../models/Application');
const User = require('../models/User');
const Profile = require('../models/Profile'); // Ensure Profile model is imported
const { protect, adminOnly, superAdminOnly } = require('../middleware/auth');
const axios = require('axios');
const bcrypt = require('bcryptjs');

const router = express.Router();

router.use(protect);
router.use(adminOnly);

// --- Application Routes (The only section with changes) ---
router.get('/applications', async (req, res) => {
  try {
    let applicationFilter = {};
    if (req.user.email !== process.env.ADMIN_EMAIL) {
      const adminJobs = await Job.find({ postedBy: req.user._id }).select('_id').lean();
      const adminJobIds = adminJobs.map(job => job._id);
      applicationFilter.job = { $in: adminJobIds };
    }

    let applications = await Application.find(applicationFilter)
      .populate('candidate', 'name email')
      .populate({ path: 'job', select: 'title' })
      .sort({ createdAt: -1 })
      .lean();


    // --- START: THE FIX ---
    if (applications.length > 0) {
      // 1. Get all the candidate IDs from the applications
      const candidateIds = applications.map(app => app.candidate?._id.toString()).filter(id => id);

      // 2. Find all matching profiles in the 'profiles' collection
      const profiles = await Profile.find({ user_id: { $in: candidateIds } }).select('user_id resume_url').lean();

      // 3. Create a map for easy lookup (candidateId -> resumeUrl)
      const profileMap = profiles.reduce((map, profile) => {
        map[profile.user_id] = profile.resume_url;
        return map;
      }, {});

      // 4. Add the 'resumeUrl' to each application object
      applications = applications.map(app => {
        const resumeUrl = app.candidate ? profileMap[app.candidate._id.toString()] || null : null;
        return { ...app, resumeUrl };
      });
    }
    // --- END: THE FIX ---

    res.json({ applications });

  } catch (error) {
    console.error('[SERVER] Error fetching admin applications:', error);
    res.status(500).json({ message: 'Server error fetching applications' });
  }
});


// --- ALL OTHER ROUTES (No changes needed below this line) ---
router.post('/jobs', async (req, res) => {
  try {
    const { title, company, description, role, salary, requirements } = req.body;
    const job = await Job.create({ title, company, description, role, salary, requirements, postedBy: req.user._id });
    res.status(201).json({ message: 'Job created successfully', job });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ message: 'Server error creating job', error: error.message });
  }
});

router.get('/jobs', async (req, res) => {
  try {
    let query = {};
    if (req.user.email !== process.env.ADMIN_EMAIL) {
      query.postedBy = req.user._id;
    }
    const jobs = await Job.find(query).populate('postedBy', 'name email').sort({ createdAt: -1 }).lean();
    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching admin jobs:', error);
    res.status(500).json({ message: 'Server error fetching jobs' });
  }
});

router.put('/applications/:id', async (req, res) => {
    try {
      const { status } = req.body;
      const application = await Application.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
      if (!application) return res.status(404).json({ message: 'Application not found' });
      res.json({ message: 'Application updated', application });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
});




router.get('/candidates-with-resumes', async (req, res) => {
  try {
    // 1. Get user_ids from Python service (existing code)
    const pythonApiUrl = process.env.VITE_PYTHON_API_URL || 'http://localhost:8000/api';
    const pythonRes = await axios.get(`${pythonApiUrl}/admin/resumes/user-ids`, { headers: { Authorization: req.headers.authorization } });
    const userIdsFromPython = pythonRes.data || [];

    if (userIdsFromPython.length === 0) {
      return res.json({ candidates: [] });
    }

    // 2. Fetch User details for these IDs (existing code, adjusted)
    // Convert userIdsFromPython (strings) to ObjectId for User query if necessary, though comparing strings might work too.
    // Let's fetch using the string IDs first, then adjust if needed.
    const candidates = await User.find({ _id: { $in: userIdsFromPython } }) // Querying User model by _id
                                 .select('name email createdAt')
                                 .sort({ createdAt: -1 })
                                 .lean();


    // --- START: ADDED CODE TO FETCH RESUME URLS ---
    // 3. Fetch corresponding Profiles using user_id (which matches User._id as string)
    const profiles = await Profile.find({ user_id: { $in: userIdsFromPython } }) // Querying Profile model by user_id string
                                  .select('user_id resume_url')
                                  .lean();

    // 4. Create a map for easy lookup (userId -> resumeUrl)
    const profileMap = profiles.reduce((map, profile) => {
      map[profile.user_id] = profile.resume_url; // user_id is already a string here
      return map;
    }, {});

    // 5. Add resumeUrl to each candidate object
    const candidatesWithResumes = candidates.map(candidate => ({
      ...candidate,
      resumeUrl: profileMap[candidate._id.toString()] || null // Convert candidate._id to string for lookup
    }));

    res.json({ candidates: candidatesWithResumes }); // Send the merged data

  } catch (error) {
    console.error('[SERVER] Error fetching candidates with resumes:', error);
    // Provide more detailed error response
    res.status(500).json({
       message: 'Server error fetching candidates',
       error: error.message,
       response: error.response?.data // Include Python API error if available
    });
  }
});



// router.post('/users/promote/:userId', superAdminOnly, async (req, res) => {
//     try {
//         const user = await User.findById(req.params.userId);
//         if (!user || user.role === 'admin') return res.status(400).json({ message: 'Cannot promote this user.' });
//         user.role = 'admin';
//         await user.save();
//         res.json({ message: 'User promoted.' });
//     } catch (error) {
//         res.status(500).json({ message: 'Server error.' });
//     }
// });

router.get('/users/candidates', superAdminOnly, async (req, res) => {
    try {
        const candidates = await User.find({ role: 'candidate' }).select('name email _id').sort({ name: 1 }).lean();
        res.json({ candidates });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/users/create-admin', superAdminOnly, async (req, res) => {
    const { name, email, password } = req.body;
    try {
        if (await User.findOne({ email })) return res.status(400).json({ message: 'User already exists.' });
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ name, email, password: hashedPassword, role: 'admin', isVerified: true });
        res.status(201).json({ message: 'Admin created.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
});

// router.post('/users/demote/:userId', superAdminOnly, async (req, res) => {
//     try {
//         const user = await User.findById(req.params.userId);
//         if (!user || user.email === process.env.ADMIN_EMAIL) return res.status(400).json({ message: 'Cannot demote this user.' });
//         user.role = 'candidate';
//         await user.save();
//         res.json({ message: 'User demoted.' });
//     } catch (error) {
//         res.status(500).json({ message: 'Server error.' });
//     }
// });

router.get('/users/admins', superAdminOnly, async (req, res) => {
    try {
        const admins = await User.find({ role: 'admin', email: { $ne: process.env.ADMIN_EMAIL } }).select('name email _id').lean();
        res.json({ admins });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;