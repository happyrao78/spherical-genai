const express = require('express');
const Job = require('../models/Job');
const Application = require('../models/Application');
const { protect } = require('../middleware/auth');
const axios = require('axios'); // Import axios

const router = express.Router();

// Get all jobs
router.get('/', protect, async (req, res) => {
  console.log("\n[SERVER] GET /api/jobs: Request received.");
  try {
    const jobs = await Job.find().sort({ createdAt: -1 }).lean(); // Use lean for performance
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
  const candidateId = req.user._id; // ID object from protect middleware
  console.log(`\n[SERVER] POST /api/jobs/${jobId}/apply: Request received from user ${candidateId}.`);

  try {
    // 1. Find the Job
    const job = await Job.findById(jobId).lean(); // Use lean as we only read from job
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

    // 3. Create the Application record (without score initially)
    const application = await Application.create({
      job: jobId,
      candidate: candidateId,
      status: 'pending', // Explicitly set default status
      matchScore: null // Initialize score as null
    });
    console.log(`[SERVER-INFO] POST /api/jobs/${jobId}/apply: Application ${application._id} created for user ${candidateId}.`);


    // --- START: Calculate and Save Match Score (Asynchronously) ---
    // We do this after creating the application so the user gets a quick response
    // Use setImmediate or process.nextTick to avoid blocking the response, or just run it async
    // Using async directly here might slightly delay the response but ensures atomicity better
    try {
        // Use environment variable for Python service URL, default if not set
        const pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:8000/api';

        // Prepare data for Python service
        const scorePayload = {
            user_id: candidateId.toString(), // Send the candidate's user ID as string
            job_data: { // Send relevant job details
                role: job.role,
                description: job.description,
                requirements: job.requirements || ''
            }
        };

        console.log(`[SERVER] POST /api/jobs/${jobId}/apply: Calling Python service at ${pythonApiUrl}/calculate-job-match for application ${application._id}`);

        // Call Python service, forwarding the user's token
        const scoreRes = await axios.post(`${pythonApiUrl}/calculate-job-match`, scorePayload, {
            headers: {
                // Forward the 'Authorization' header from the original request
                'Authorization': req.headers.authorization
            }
        });

        const matchScore = scoreRes.data.matchScore;
        console.log(`[SERVER] POST /api/jobs/${jobId}/apply: Received match score: ${matchScore} for application ${application._id}`);

        // Save the score to the application document if valid
        if (matchScore !== undefined && matchScore !== null && !isNaN(matchScore)) {
            // Re-fetch the application to update it safely, or use updateOne
             await Application.updateOne(
                 { _id: application._id },
                 { $set: { matchScore: matchScore } }
             );
            // application.matchScore = matchScore; // If using the fetched object
            // await application.save();           // If using the fetched object
            console.log(`[SERVER] POST /api/jobs/${jobId}/apply: Saved match score ${matchScore} for application ${application._id}`);
        } else {
             console.warn(`[SERVER-WARN] POST /api/jobs/${jobId}/apply: Did not receive a valid numeric match score for application ${application._id}. Received: ${matchScore}`);
        }

    } catch (scoreError) {
        // Log the error but don't fail the entire application process
        console.error(`[SERVER-ERROR] POST /api/jobs/${jobId}/apply: Failed to calculate/save match score for application ${application._id}:`,
           scoreError.response?.data || scoreError.message);
        // Optionally update status or score to indicate failure, e.g., score = -1
        // await Application.updateOne({ _id: application._id }, { $set: { matchScore: -1 } });
    }
    // --- END: Calculate and Save Match Score ---

    // Respond to the user immediately after creating the application document
    res.status(201).json({ message: 'Application submitted successfully. Score calculation initiated.', application });

  } catch (error) {
     console.error(`[SERVER-ERROR] POST /api/jobs/${jobId}/apply: General error:`, error);
     // Handle potential duplicate key errors during Application.create if needed
     if (error.code === 11000) {
         return res.status(400).json({ message: 'Application already exists (concurrent request likely).' });
     }
    res.status(500).json({ message: 'Server error applying to job', error: error.message });
  }
});

// Get user's applications (to check which jobs already applied)
router.get('/my-applications', protect, async (req, res) => {
  console.log(`\n[SERVER] GET /api/jobs/my-applications: Request received from user ${req.user._id}.`);
  try {
    const applications = await Application.find({ candidate: req.user._id })
      .select('job') // Only need the job ID
      .lean();

    // Return just an array job IDs that user has applied to
    const appliedJobIds = applications.map(app => app.job.toString());
    console.log(`[SERVER-INFO] GET /api/jobs/my-applications: User ${req.user._id} applied to ${appliedJobIds.length} jobs.`);

    res.json({ appliedJobIds });
  } catch (error) {
    console.error(`[SERVER-ERROR] GET /api/jobs/my-applications: Error fetching applications for user ${req.user._id}:`, error);
    res.status(500).json({ message: 'Server error fetching user applications', error: error.message });
  }
});

module.exports = router;