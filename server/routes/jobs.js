const express = require('express');
const Job = require('../models/Job');
const Application = require('../models/Application');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Get all jobs
router.get('/', protect, async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Apply to a job
router.post('/:id/apply', protect, async (req, res) => {
  try {
    const jobId = req.params.id;
    const candidateId = req.user._id;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Check if already applied
    const existingApplication = await Application.findOne({
      job: jobId,
      candidate: candidateId,
    });

    if (existingApplication) {
      return res.status(400).json({ message: 'Already applied to this job' });
    }

    const application = await Application.create({
      job: jobId,
      candidate: candidateId,
    });

    res.status(201).json({ message: 'Application submitted successfully', application });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user's applications (check which jobs already applied)
router.get('/my-applications', protect, async (req, res) => {
  try {
    const applications = await Application.find({ candidate: req.user._id })
      .select('job')
      .lean();
    
    // Return just job IDs that user has applied to
    const appliedJobIds = applications.map(app => app.job.toString());
    
    res.json({ appliedJobIds });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;