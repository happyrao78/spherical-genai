import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { nodeAPI, pythonAPI } from '../config/api';
import { Upload, FileText, Briefcase, User, LogOut, Edit, Check, Loader, AlertCircle } from 'lucide-react';

const CandidateDashboard = () => {
  const { user, logout } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [profile, setProfile] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [loadingScores, setLoadingScores] = useState(false);
  const [appliedJobIds, setAppliedJobIds] = useState([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);

  useEffect(() => {
    fetchProfile();
    fetchAppliedJobs();
  }, []);

  useEffect(() => {
    if (profile) {
      fetchJobsAndCalculateScores();
    } else {
      fetchJobs();
    }
  }, [profile]);

  const fetchJobs = async () => {
    setLoadingScores(true);
    try {
      const res = await nodeAPI.get('/jobs');
      const jobsData = res.data.jobs.map(job => ({ ...job, matchScore: null }));
      setJobs(jobsData);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoadingScores(false);
    }
  };

  const fetchJobsAndCalculateScores = async () => {
  setLoadingScores(true);
  try {
    const jobsRes = await nodeAPI.get('/jobs');
    let jobsData = jobsRes.data.jobs;

    if (jobsData && jobsData.length > 0) {
      // Check for cached scores in sessionStorage
      const cacheKey = `jobScores_${user._id}`;
      const cachedScoresStr = sessionStorage.getItem(cacheKey);
      let scoreMap = {};

      if (cachedScoresStr) {
        try {
          const cachedData = JSON.parse(cachedScoresStr);
          // Check if cache is less than 1 hour old
          const cacheAge = Date.now() - (cachedData.timestamp || 0);
          if (cacheAge < 3600000) { // 1 hour in milliseconds
            console.log('[DEBUG] Using cached scores (age: ' + Math.round(cacheAge/60000) + ' minutes)');
            scoreMap = cachedData.scores || {};
          } else {
            console.log('[DEBUG] Cache expired, recalculating scores');
          }
        } catch (e) {
          console.warn('[DEBUG] Invalid cache data, will recalculate');
        }
      }

      // If no valid cache or missing scores, calculate
      const jobsNeedingScores = jobsData.filter(job => scoreMap[job._id] === undefined);
      
      if (jobsNeedingScores.length > 0) {
        console.log(`[DEBUG] Calculating scores for ${jobsNeedingScores.length} jobs`);
        
        const batchPayload = {
          jobs: jobsNeedingScores.map(job => ({
            job_id: job._id,
            role: job.role,
            description: job.description,
            requirements: job.requirements || '',
          })),
        };

        const scoresRes = await pythonAPI.post('/calculate-batch-job-match', batchPayload);
        const scoresData = scoresRes.data;

        // Merge new scores with cached scores
        scoresData.forEach(item => {
          scoreMap[item.job_id] = item.matchScore;
        });

        // Update cache
        sessionStorage.setItem(cacheKey, JSON.stringify({
          scores: scoreMap,
          timestamp: Date.now()
        }));
        console.log('[DEBUG] Scores cached successfully');
      }

      // Apply scores to jobs
      jobsData = jobsData.map(job => ({
        ...job,
        matchScore: scoreMap[job._id] !== undefined ? scoreMap[job._id] : 0,
      }));

      jobsData.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    } else {
      jobsData = [];
    }

    setJobs(jobsData);
  } catch (error) {
    console.error('Error fetching jobs and scores:', error);
    
    // Fallback to cached scores on error
    const cacheKey = `jobScores_${user._id}`;
    const cachedScoresStr = sessionStorage.getItem(cacheKey);
    if (cachedScoresStr) {
      try {
        const cached = JSON.parse(cachedScoresStr);
        const jobsRes = await nodeAPI.get('/jobs');
        let jobsData = jobsRes.data.jobs.map(job => ({
          ...job,
          matchScore: cached.scores[job._id] || 0
        }));
        jobsData.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
        setJobs(jobsData);
        console.log('[DEBUG] Using cached scores due to calculation error');
      } catch (e) {
        fetchJobs();
      }
    } else {
      fetchJobs();
    }
  } finally {
    setLoadingScores(false);
  }
};

  const fetchAppliedJobs = async () => {
    try {
      const res = await nodeAPI.get('/jobs/my-applications');
      setAppliedJobIds(res.data.appliedJobIds || []);
    } catch (error) {
      console.error('Error fetching applied jobs:', error);
    }
  };

  const fetchProfile = async (retryCount = 0) => {
    setProfileLoading(true);
    setProfileError(null);
    
    try {
      const res = await pythonAPI.get('/profile');
      setProfile(res.data.profile);
      setEditData(res.data.profile || {});
      setProfileLoading(false);
    } catch (error) {
      console.error('Error fetching profile:', error);
      
      // Retry with exponential backoff
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000;
        setTimeout(() => {
          fetchProfile(retryCount + 1);
        }, delay);
      } else {
        setProfileError('Unable to load profile. Please refresh the page.');
        setProfileLoading(false);
      }
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append('resume', file);

    setUploading(true);
    try {
      await pythonAPI.post('/upload-resume', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      setUploading(false);
      setCalculating(true);
      
      await fetchProfile();
      sessionStorage.removeItem(`jobScores_${user._id}`);
      await fetchJobsAndCalculateScores();
      
      setFile(null);
      alert('Resume uploaded successfully!');
    } catch (error) {
      console.error('Upload error:', error);
      alert('Error uploading resume: ' + (error.response?.data?.detail || error.message));
    } finally {
      setUploading(false);
      setCalculating(false);
    }
  };

  const handleApplyJob = async (jobId) => {
    if (!profile) {
      alert('Please upload your resume before applying to jobs.');
      return;
    }
    
    try {
      await nodeAPI.post(`/jobs/${jobId}/apply`);
      setAppliedJobIds(prev => [...prev, jobId]);
      alert('Application submitted successfully!');
    } catch (error) {
      const errorMsg = error.response?.data?.message || 'Error applying to job';
      alert(errorMsg);
    }
  };

  const handleUpdateProfile = async (e) => {
  e.preventDefault();
  try {
    await pythonAPI.put('/profile', editData);
    await fetchProfile();
    
    // IMPORTANT: Clear score cache when profile changes
    const cacheKey = `jobScores_${user._id}`;
    sessionStorage.removeItem(cacheKey);
    console.log('[DEBUG] Score cache cleared after profile update');
    
    await fetchJobsAndCalculateScores(); // Recalculate with new profile
    setEditMode(false);
    alert('Profile updated successfully!');
  } catch (error) {
    alert('Error updating profile');
  }
};

  const isJobApplied = (jobId) => {
    return appliedJobIds.includes(jobId);
  };

  const getMatchColor = (score) => {
    if (score === undefined || score === null) return 'text-gray-500';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getMatchBgColor = (score) => {
    if (score === undefined || score === null) return 'bg-gray-300';
    if (score >= 80) return 'bg-green-600';
    if (score >= 60) return 'bg-yellow-600';
    if (score >= 40) return 'bg-orange-600';
    return 'bg-red-600';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-indigo-600">Spherical</h1>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">{user?.name}</span>
              <button
                onClick={logout}
                className="flex items-center text-red-600 hover:text-red-700"
              >
                <LogOut className="h-5 w-5 mr-1" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Calculating Indicator */}
        {(loadingScores || calculating) && (
          <div className="mb-4 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded flex items-center">
            <Loader className="h-5 w-5 animate-spin mr-3" />
            <span>
              {calculating ? 'Processing your resume and calculating match scores...' : 'Calculating match scores...'}
              Please wait.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Section */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center">
                  <User className="h-5 w-5 mr-2" />
                  Profile
                </h2>
                {profile && !profileLoading && (
                  <button
                    onClick={() => setEditMode(!editMode)}
                    className="text-indigo-600 hover:text-indigo-700"
                  >
                    <Edit className="h-5 w-5" />
                  </button>
                )}
              </div>

              {profileLoading ? (
                <div className="flex items-center justify-center p-6">
                  <Loader className="h-8 w-8 animate-spin text-indigo-600" />
                  <span className="ml-2 text-gray-600">Loading profile...</span>
                </div>
              ) : profileError ? (
                <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Error</p>
                      <p className="text-sm mt-1">{profileError}</p>
                      <button
                        onClick={() => fetchProfile(0)}
                        className="mt-2 text-sm underline hover:no-underline"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                </div>
              ) : !profile ? (
                <form onSubmit={handleFileUpload} className="space-y-4">
                  {/* AI Disclaimer */}
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-yellow-800">
                          AI-Generated Information
                        </p>
                        <p className="mt-1 text-sm text-yellow-700">
                          Profile information is automatically extracted using AI. Please review and verify all details for accuracy.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-gray-600">Upload your resume to get started</p>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors">
                    <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      onChange={(e) => setFile(e.target.files[0])}
                      className="hidden"
                      id="resume-upload"
                    />
                    <label
                      htmlFor="resume-upload"
                      className="cursor-pointer text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Choose PDF or DOCX file
                    </label>
                    {file && (
                      <p className="mt-2 text-sm text-gray-600">
                        Selected: {file.name}
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={!file || uploading}
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {uploading ? 'Uploading...' : 'Upload Resume'}
                  </button>
                </form>
              ) : editMode ? (
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                    <p className="text-xs text-yellow-800">
                      <strong>Note:</strong> AI-extracted data. Please verify accuracy before saving.
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
                    <textarea
                      value={editData.skills || ''}
                      onChange={(e) => setEditData({ ...editData, skills: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      rows="2"
                      placeholder="Python, JavaScript, React, etc."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Experience</label>
                    <textarea
                      value={editData.experience || ''}
                      onChange={(e) => setEditData({ ...editData, experience: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      rows="5"
                      placeholder="Describe your work experience..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Years of Experience</label>
                    <input
                      type="text"
                      value={editData.years_of_experience || ''}
                      onChange={(e) => setEditData({ ...editData, years_of_experience: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="e.g., 5 years"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Education</label>
                    <textarea
                      value={editData.education || ''}
                      onChange={(e) => setEditData({ ...editData, education: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      rows="3"
                      placeholder="Your educational background..."
                    />
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      type="submit"
                      className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditMode(false);
                        setEditData(profile || {});
                      }}
                      className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-3">
                    <p className="text-xs text-blue-800">
                      ℹ️ Profile auto-generated by AI. Verify and edit if needed.
                    </p>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Skills</h3>
                    <p className="text-gray-900 mt-1">{profile.skills || 'Not specified'}</p>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Experience</h3>
                    <p className="text-gray-900 text-sm mt-1">
                      {profile.experience 
                        ? (profile.experience.length > 200 
                            ? profile.experience.substring(0, 200) + '...' 
                            : profile.experience)
                        : 'Not specified'}
                    </p>
                  </div>
                  
                  {profile.education && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Education</h3>
                      <p className="text-gray-900 text-sm mt-1">{profile.education}</p>
                    </div>
                  )}
                  
                  {profile.years_of_experience && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Years of Experience</h3>
                      <p className="text-gray-900 mt-1">{profile.years_of_experience}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Jobs Section */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold flex items-center mb-6">
                <Briefcase className="h-5 w-5 mr-2" />
                Available Jobs
              </h2>

              <div className="space-y-4">
                {jobs.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No jobs available at the moment</p>
                ) : (
                  jobs.map((job) => (
                    <div key={job._id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
                          <p className="text-indigo-600 font-medium">{job.company}</p>
                        </div>
                        {profile && job.matchScore !== undefined && job.matchScore !== null && (
                          <div className="ml-4 text-center">
                            <div className={`text-2xl font-bold ${getMatchColor(job.matchScore)}`}>
                              {job.matchScore}%
                            </div>
                            <div className="text-xs text-gray-500">Match</div>
                          </div>
                        )}
                      </div>

                      <p className="text-gray-600 mt-2 text-sm">{job.description}</p>
                      
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                          {job.role}
                        </span>
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                          ₹{job.salary}
                        </span>
                      </div>

                      {profile && job.matchScore !== undefined && job.matchScore !== null && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-700">Eligibility Score</span>
                            <span className={`text-sm font-semibold ${getMatchColor(job.matchScore)}`}>
                              {job.matchScore >= 80 ? 'Excellent Match' : 
                               job.matchScore >= 60 ? 'Good Match' : 
                               job.matchScore >= 40 ? 'Fair Match' : 'Low Match'}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                              className={`h-2.5 rounded-full transition-all ${getMatchBgColor(job.matchScore)}`}
                              style={{ width: `${job.matchScore}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {isJobApplied(job._id) ? (
                        <button
                          disabled
                          className="mt-4 w-full bg-gray-400 text-white py-2 rounded-lg cursor-not-allowed flex items-center justify-center"
                        >
                          <Check className="h-5 w-5 mr-2" />
                          Applied
                        </button>
                      ) : (
                        <button
                          onClick={() => handleApplyJob(job._id)}
                          disabled={!profile}
                          className={`mt-4 w-full py-2 rounded-lg transition-colors flex items-center justify-center ${
                            !profile 
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          }`}
                        >
                          {!profile ? (
                            <>
                              <Upload className="h-5 w-5 mr-2" />
                              Upload Resume First
                            </>
                          ) : (
                            'Apply Now'
                          )}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CandidateDashboard;