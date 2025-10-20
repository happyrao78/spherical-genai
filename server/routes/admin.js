const express = require('express');
const Job = require('../models/Job');
const Application = require('../models/Application');
const { protect, adminOnly } = require('../middleware/auth');
const axios = require('axios'); 

const router = express.Router();

// All routes require admin authentication
router.use(protect);
router.use(adminOnly);



router.get('/applications', async (req, res) => {
  try {
    const applications = await Application.find()
      .populate('candidate', 'name email')
      .populate('job', 'title company description role requirements') // Populate job details
      .sort({ createdAt: -1 });

    // Calculate match scores
    const applicationsWithScores = await Promise.all(
      applications.map(async (app) => {
        if (app.job && app.candidate) {
          try {
            const pythonApiUrl = process.env.VITE_PYTHON_API_URL || 'http://localhost:8000/api';
            const matchRes = await axios.post(`${pythonApiUrl}/calculate-job-match`, {
              job_data: {
                role: app.job.role,
                description: app.job.description,
                requirements: app.job.requirements || '',
              },
              user_id: app.candidate._id.toString(),
            }, {
              headers: {
                Authorization: req.headers.authorization,
              }
            });
            app.matchScore = matchRes.data.matchScore || 0;
          } catch (error) {
            console.error('Error calculating match for application:', app._id, error);
            app.matchScore = 0; // Default to 0 on error
          }
        }
        return app;
      })
    );

    res.json({ applications: applicationsWithScores });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


// Create job
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all jobs (admin view)
router.get('/jobs', async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all applications
router.get('/applications', async (req, res) => {
  try {
    const applications = await Application.find()
      .populate('candidate', 'name email')
      .populate('job', 'title company')
      .sort({ createdAt: -1 });

    res.json({ applications });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update application status
router.put('/applications/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const application = await Application.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    res.json({ message: 'Application updated', application });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;