const express = require('express');
const Job = require('../models/Job');
const Application = require('../models/Application');
const { protect } = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();

// Get all jobs
router.get('/', protect, async (req, res) => {
  console.log("\n[SERVER] GET /api/jobs: Request received.");
  try {
    const jobs = await Job.find().sort({ createdAt: -1 }).lean();
    console.log(`[SERVER-INFO] GET /api/jobs: Fetched ${jobs.length} jobs.`);
    res.json({ jobs });
  } catch (error) {
    console.error('[SERVER-ERROR] GET /api/jobs:', error);
    res.status(500).json({ message: 'Server error fetching jobs', error: error.message });
  }
});

// Apply to a job
router.post('/:id/apply', protect, async (req, res) => {
  const jobId = req.params.id;
  const candidateId = req.user._id;
  console.log(`\n[SERVER] POST /api/jobs/${jobId}/apply: Request received from user ${candidateId}.`);

  try {
    // 1. Find the Job
    const job = await Job.findById(jobId).lean();
    if (!job) {
      console.warn(`[SERVER-WARN] POST /api/jobs/${jobId}/apply: Job not found.`);
      return res.status(404).json({ message: 'Job not found' });
    }
    console.log(`[SERVER-DEBUG] POST /api/jobs/${jobId}/apply: Found job titled "${job.title}".`);

    // 2. Check if already applied
    const existingApplication = await Application.findOne({
      job: jobId,
      candidate: candidateId,
    });

    if (existingApplication) {
      console.warn(`[SERVER-WARN] POST /api/jobs/${jobId}/apply: User ${candidateId} already applied.`);
      return res.status(400).json({ message: 'Already applied to this job' });
    }

    // 3. Create the Application record with initial score
    const application = await Application.create({
      job: jobId,
      candidate: candidateId,
      status: 'pending',
      matchScore: 0 // Set initial score to 0
    });
    console.log(`[SERVER-INFO] POST /api/jobs/${jobId}/apply: Application ${application._id} created for user ${candidateId}.`);

    // 4. Send immediate response to user
    res.status(201).json({ 
      message: 'Application submitted successfully', 
      application: {
        _id: application._id,
        job: application.job,
        candidate: application.candidate,
        status: application.status,
        matchScore: application.matchScore
      }
    });

    // 5. Calculate score asynchronously (don't block response)
    setImmediate(async () => {
      try {
        const pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:8000/api';
        const scorePayload = {
          user_id: candidateId.toString(),
          job_data: {
            role: job.role,
            description: job.description,
            requirements: job.requirements || ''
          }
        };

        console.log(`[SERVER] Calling Python service for score calculation...`);
        
        const scoreRes = await axios.post(`${pythonApiUrl}/calculate-job-match`, scorePayload, {
          headers: { 'Authorization': req.headers.authorization },
          timeout: 30000 // 30 second timeout
        });

        const matchScore = scoreRes.data.matchScore;
        console.log(`[SERVER] Received match score: ${matchScore} for application ${application._id}`);

        if (matchScore !== undefined && matchScore !== null && !isNaN(matchScore)) {
          await Application.updateOne(
            { _id: application._id },
            { $set: { matchScore: matchScore } }
          );
          console.log(`[SERVER] Match score saved successfully for application ${application._id}`);
        } else {
          console.warn(`[SERVER-WARN] Invalid match score received: ${matchScore}`);
        }
      } catch (scoreError) {
        console.error(`[SERVER-ERROR] Score calculation failed for application ${application._id}:`, 
          scoreError.response?.data || scoreError.message);
        // Keep score as 0 on error
      }
    });

  } catch (error) {
    console.error(`[SERVER-ERROR] POST /api/jobs/${jobId}/apply: General error:`, error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Application already exists' });
    }
    
    res.status(500).json({ message: 'Server error applying to job', error: error.message });
  }
});

// Get user's applications
router.get('/my-applications', protect, async (req, res) => {
  console.log(`\n[SERVER] GET /api/jobs/my-applications: Request received from user ${req.user._id}.`);
  try {
    const applications = await Application.find({ candidate: req.user._id })
      .select('job')
      .lean();

    const appliedJobIds = applications.map(app => app.job.toString());
    console.log(`[SERVER-INFO] GET /api/jobs/my-applications: User ${req.user._id} applied to ${appliedJobIds.length} jobs.`);

    res.json({ appliedJobIds });
  } catch (error) {
    console.error(`[SERVER-ERROR] GET /api/jobs/my-applications:`, error);
    res.status(500).json({ message: 'Server error fetching user applications', error: error.message });
  }
});

module.exports = router;