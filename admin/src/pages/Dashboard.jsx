import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { nodeAPI, pythonAPI } from '../config/api';
import { Briefcase, Users, Search, LogOut, Plus, Loader, FileText, UserPlus, AlertCircle } from 'lucide-react'; // Added UserPlus, AlertCircle

const Dashboard = () => {
  const { admin, logout } = useAuth(); // admin object now has isSuperAdmin
  const [activeTab, setActiveTab] = useState('jobs'); // Default back to jobs or keep 'candidates'
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [candidates, setCandidates] = useState([]); // Candidates with resumes list
  const [candidateUsers, setCandidateUsers] = useState([]); // Users available for promotion
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showJobForm, setShowJobForm] = useState(false); // State to toggle job form visibility
  const [jobForm, setJobForm] = useState({ // State for the job form fields
    title: '',
    company: '',
    description: '',
    role: '',
    salary: '',
    requirements: '',
  });
  const [loadingError, setLoadingError] = useState(''); // State for loading errors

  // Fetch data based on admin status when component mounts or admin object changes
  useEffect(() => {
    setLoadingError(''); // Clear previous errors on reload/login change
    if (admin) { // Only fetch if admin object is available
      fetchJobs();
      fetchApplications();
      fetchCandidates();

      if (admin.isSuperAdmin) {
        fetchCandidateUsers();
      } else {
        setCandidateUsers([]); // Clear promotion list if not super admin
      }
    } else {
      // Clear data if admin logs out
      setJobs([]);
      setApplications([]);
      setCandidates([]);
      setCandidateUsers([]);
    }
  }, [admin]); // Re-run fetches when admin object changes

  // --- Data Fetching Functions ---
  const fetchJobs = async () => {
    try {
      const res = await nodeAPI.get('/admin/jobs');
      setJobs(res.data.jobs || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      setLoadingError('Could not load jobs. Please try again later.');
    }
  };

  const fetchApplications = async () => {
    try {
      const res = await nodeAPI.get('/admin/applications');
      setApplications(res.data.applications || []);
    } catch (error) {
      console.error('Error fetching applications:', error);
      setLoadingError('Could not load applications. Please try again later.');
    }
  };

  const fetchCandidates = async () => {
    try {
      const res = await nodeAPI.get('/admin/candidates-with-resumes');
      setCandidates(res.data.candidates || []);
    } catch (error) {
      console.error('Error fetching candidates:', error);
      setLoadingError('Could not load candidates list. Please try again later.');
    }
  };

  const fetchCandidateUsers = async () => {
    if (!admin?.isSuperAdmin) return;
    try {
      const res = await nodeAPI.get('/admin/users/candidates');
      setCandidateUsers(res.data.candidates || []);
    } catch (error) {
      console.error('Error fetching candidate users for promotion:', error);
      alert('Could not load users for promotion.');
    }
  };

  // --- Action Handlers ---
  const handleCreateJob = async (e) => {
    e.preventDefault(); // Prevent default form submission behavior
    // Basic frontend validation
    if (!jobForm.title || !jobForm.company || !jobForm.description || !jobForm.role || !jobForm.salary) {
      alert('Please fill in all required job fields.');
      return;
    }
    try {
      // Send the jobForm data to the backend
      await nodeAPI.post('/admin/jobs', jobForm);

      // On success: hide form, reset fields, refresh list, notify user
      setShowJobForm(false);
      setJobForm({ title: '', company: '', description: '', role: '', salary: '', requirements: '' });
      fetchJobs();
      alert('Job posted successfully!');
    } catch (error) {
      console.error('Error creating job:', error);
      // Show backend error message if available
      alert(`Error creating job: ${error.response?.data?.message || 'Server error. Please check console.'}`);
    }
  };

  const handlePromoteUser = async (userId, userName) => {
    if (!admin?.isSuperAdmin) return;
    if (!window.confirm(`Are you sure you want to promote ${userName} to Admin?`)) {
      return;
    }
    try {
      await nodeAPI.post(`/admin/users/promote/${userId}`);
      alert('User promoted successfully!');
      fetchCandidateUsers(); // Refresh the list
    } catch (error) {
      console.error('Error promoting user:', error);
      alert(`Promotion failed: ${error.response?.data?.message || 'Server error'}`);
    }
  };

  const handleSemanticSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      alert('Please enter a search query');
      return;
    }
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await pythonAPI.post('/semantic-search', { query: searchQuery });
      setSearchResults(res.data.results || []);
      // Message handled in the JSX now
    } catch (error) {
      console.error('Search error:', error);
      alert('Error performing search');
    } finally {
      setSearching(false);
    }
  };

  // --- Helper Functions ---
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

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (e) {
      return 'Invalid Date';
    }
  };

  // --- JSX Rendering ---
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-purple-600">Admin Portal - Spherical</h1>
            <div className="flex items-center space-x-4">
              {admin?.isSuperAdmin && (
                <span className="text-xs font-semibold text-red-600 border border-red-300 px-2 py-0.5 rounded-full">Super Admin</span>
              )}
              <span className="text-gray-700">{admin?.name || 'Admin'}</span>
              <button onClick={logout} className="flex items-center text-red-600 hover:text-red-700">
                <LogOut className="h-5 w-5 mr-1" /> Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Loading Error Display */}
        {loadingError && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded flex items-center">
            <AlertCircle className="h-5 w-5 mr-3" />
            <span>{loadingError}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="flex border-b flex-wrap">
            {/* Job Postings Tab */}
            <button onClick={() => setActiveTab('jobs')} className={`flex-1 min-w-[150px] py-4 px-6 text-center font-medium ${activeTab === 'jobs' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}>
              <Briefcase className="h-5 w-5 inline mr-2" /> Job Postings
            </button>
            {/* Applications Tab */}
            <button onClick={() => setActiveTab('applications')} className={`flex-1 min-w-[150px] py-4 px-6 text-center font-medium ${activeTab === 'applications' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}>
              <Users className="h-5 w-5 inline mr-2" /> Applications
            </button>
            {/* Candidates w/ Resumes Tab */}
            <button onClick={() => setActiveTab('candidates')} className={`flex-1 min-w-[150px] py-4 px-6 text-center font-medium ${activeTab === 'candidates' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}>
              <FileText className="h-5 w-5 inline mr-2" /> Candidates w/ Resumes
            </button>
            {/* Semantic Search Tab */}
            <button onClick={() => setActiveTab('search')} className={`flex-1 min-w-[150px] py-4 px-6 text-center font-medium ${activeTab === 'search' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}>
              <Search className="h-5 w-5 inline mr-2" /> Semantic Search
            </button>
            {/* Manage Admins Tab (Conditional) */}
            {admin?.isSuperAdmin && (
              <button onClick={() => setActiveTab('manageAdmins')} className={`flex-1 min-w-[150px] py-4 px-6 text-center font-medium ${activeTab === 'manageAdmins' ? 'border-b-2 border-red-600 text-red-600' : 'text-gray-600 hover:text-gray-900'}`}>
                <UserPlus className="h-5 w-5 inline mr-2" /> Manage Admins
              </button>
            )}
          </div>
        </div>

        {/* ======================= */}
        {/* Jobs Tab Content        */}
        {/* ======================= */}
        {activeTab === 'jobs' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Job Postings {admin?.isSuperAdmin ? '(All)' : '(My Postings)'}</h2>
              <button
                onClick={() => setShowJobForm(!showJobForm)} // Correctly toggles state
                className="flex items-center bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                {showJobForm ? 'Cancel' : 'New Job'} {/* Dynamically change button text */}
              </button>
            </div>

            {/* --- Corrected New Job Form --- */}
            {showJobForm && (
              <form onSubmit={handleCreateJob} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">Create New Job Posting</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Job Title */}
                  <div>
                    <label htmlFor="jobTitle" className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                    <input
                      id="jobTitle"
                      type="text"
                      value={jobForm.title} // Correct: Binds to jobForm state
                      onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} // Correct: Updates jobForm state
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                      required
                    />
                  </div>
                  {/* Company */}
                  <div>
                    <label htmlFor="jobCompany" className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                    <input
                      id="jobCompany"
                      type="text"
                      value={jobForm.company} // Correct: Binds to jobForm state
                      onChange={(e) => setJobForm({ ...jobForm, company: e.target.value })} // Correct: Updates jobForm state
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                      required
                    />
                  </div>
                  {/* Role */}
                  <div>
                    <label htmlFor="jobRole" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <input
                      id="jobRole"
                      type="text"
                      value={jobForm.role} // Correct: Binds to jobForm state
                      onChange={(e) => setJobForm({ ...jobForm, role: e.target.value })} // Correct: Updates jobForm state
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                      placeholder="e.g., Software Engineer, Marketing Manager"
                      required
                    />
                  </div>
                  {/* Salary */}
                  <div>
                    <label htmlFor="jobSalary" className="block text-sm font-medium text-gray-700 mb-1">Salary (CTC)</label>
                    <input
                      id="jobSalary"
                      type="text"
                      value={jobForm.salary} // Correct: Binds to jobForm state
                      onChange={(e) => setJobForm({ ...jobForm, salary: e.target.value })} // Correct: Updates jobForm state
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                      placeholder="e.g., 12 LPA, 80,000 INR/Month"
                      required
                    />
                  </div>
                  {/* Description */}
                  <div className="md:col-span-2">
                    <label htmlFor="jobDescription" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      id="jobDescription"
                      value={jobForm.description} // Correct: Binds to jobForm state
                      onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} // Correct: Updates jobForm state
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                      rows="4"
                      required
                    />
                  </div>
                  {/* Requirements */}
                  <div className="md:col-span-2">
                    <label htmlFor="jobRequirements" className="block text-sm font-medium text-gray-700 mb-1">Requirements (Optional)</label>
                    <textarea
                      id="jobRequirements"
                      value={jobForm.requirements} // Correct: Binds to jobForm state
                      onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })} // Correct: Updates jobForm state
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                      rows="3"
                      placeholder="List required skills, experience, qualifications..."
                    />
                  </div>
                </div>
                {/* Form Buttons */}
                <div className="mt-6 flex space-x-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowJobForm(false)} // Correctly hides form on cancel
                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit" // Correctly submits the form
                    className="bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700"
                  >
                    Create Job
                  </button>
                </div>
              </form>
            )}

            {/* Job List */}
            <div className="mt-6 space-y-4"> {/* Added margin if form is shown */}
              {jobs.length === 0 ? (
                <p className="text-gray-600 text-center py-4">No jobs posted yet {admin?.isSuperAdmin ? '' : 'by you'}.</p>
              ) : (
                jobs.map((job) => (
                  <div key={job._id} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                    <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
                    <p className="text-purple-600 font-medium">{job.company}</p>
                    {admin?.isSuperAdmin && job.postedBy && (
                      <p className="text-xs text-gray-500 mt-1">Posted by: {job.postedBy.name} ({job.postedBy.email})</p>
                    )}
                    <p className="text-gray-600 mt-2 text-sm">{job.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">{job.role}</span>
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">₹{job.salary}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* --- Other Tab Contents --- */}

        {/* Applications Tab Content */}
        {activeTab === 'applications' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-6">Applications {admin?.isSuperAdmin ? '(All)' : '(For My Jobs)'}</h2>
            <div className="space-y-4">
              {applications.length === 0 ? (
                <p className="text-gray-600">No applications received yet {admin?.isSuperAdmin ? '' : 'for your jobs'}.</p>
              ) : (
                applications.map((app) => (
                  <div key={app._id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    {/* ... Application card JSX ... */}
                     <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">{app.candidate?.name || 'N/A'}</h3>
                        <p className="text-gray-600 text-sm">{app.candidate?.email || 'N/A'}</p>
                        <p className="text-purple-600 font-medium mt-2 text-sm">Applied for: {app.job?.title || 'N/A'}</p>
                         {admin?.isSuperAdmin && app.job?.postedBy && (
                            <p className="text-xs text-gray-500 mt-1">Job posted by: {app.job.postedBy.name}</p>
                         )}
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${ app.status === 'accepted' ? 'bg-green-100 text-green-800' : app.status === 'rejected' ? 'bg-red-100 text-red-800' : app.status === 'reviewed' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800' }`}>
                           {app.status}
                          </span>
                           {app.matchScore !== undefined && (
                            <div className="ml-4 text-center mt-2">
                                <div className={`text-2xl font-bold ${getMatchColor(app.matchScore)}`}>{app.matchScore}%</div>
                                <div className="text-xs text-gray-500">Match</div>
                            </div>
                           )}
                      </div>
                    </div>
                     {app.matchScore !== undefined && (
                         <div className="mt-3">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-700">Eligibility Score</span>
                                <span className={`text-sm font-semibold ${getMatchColor(app.matchScore)}`}>
                                {app.matchScore >= 80 ? 'Excellent' : app.matchScore >= 60 ? 'Good' : app.matchScore >= 40 ? 'Fair' : 'Low'} Match
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5"><div className={`h-2.5 rounded-full ${getMatchBgColor(app.matchScore)}`} style={{ width: `${app.matchScore}%` }}/></div>
                        </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Candidates w/ Resumes Tab Content */}
        {activeTab === 'candidates' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-6">Candidates with Uploaded Resumes</h2>
            <div className="space-y-4">
              {candidates.length === 0 ? (<p className="text-gray-600">No candidates have uploaded resumes yet.</p>) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    {/* ... Table headers ... */}
                     <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registered On</th>
                          </tr>
                        </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {candidates.map((candidate) => (
                        <tr key={candidate._id}>
                           <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{candidate.name}</td>
                           <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{candidate.email}</td>
                           <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(candidate.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Semantic Search Tab Content */}
        {activeTab === 'search' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-6">Semantic Candidate Search</h2>
            <form onSubmit={handleSemanticSearch} className="mb-6">
               <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g., candidate with experience in machine learning and python"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  required
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center"
                >
                  {searching ? <Loader className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                </button>
              </div>
            </form>
            <div className="space-y-4">
              {searching ? ( <div className="text-center py-8"> <Loader className="h-8 w-8 animate-spin mx-auto text-purple-600" /> <p className="mt-2 text-gray-600">Searching...</p> </div> )
              : searchResults.length === 0 && searchQuery ? (<p className="text-gray-600">No matching candidates found.</p>)
              : searchResults.length === 0 ? (<p className="text-gray-600">Enter query to find candidates.</p>)
              : ( searchResults.map((result, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        {/* ... Result card details ... */}
                         <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900">{result.name || 'Unknown'}</h3>
                            <p className="text-gray-600">{result.email}</p>
                            {result.skills && ( <div className="mt-2"><p className="text-sm font-medium text-gray-700">Skills:</p><p className="text-gray-600">{result.skills}</p></div> )}
                            {result.experience && ( <div className="mt-2"><p className="text-sm font-medium text-gray-700">Experience:</p><p className="text-gray-600 text-sm">{result.experience}</p></div> )}
                            {result.education && ( <div className="mt-2"><p className="text-sm font-medium text-gray-700">Education:</p><p className="text-gray-600 text-sm">{result.education}</p></div> )}
                            {result.years_experience && ( <div className="mt-2"><p className="text-sm font-medium text-gray-700">Years:</p><p className="text-gray-600">{result.years_experience}</p></div> )}
                          </div>
                          <div className="ml-4 text-right">
                            <div className="mb-2">
                              <span className="text-xs font-medium text-gray-500">Final Score</span>
                              <div className={`text-3xl font-bold ${getMatchColor(result.final_score)}`}>{result.final_score}%</div>
                            </div>
                            <div className="text-xs text-gray-500 space-y-1"><div>Vector: {result.vector_score}%</div><div>AI: {result.ai_relevancy}%</div></div>
                          </div>
                        </div>
                         {/* Score Bars */}
                         <div className="mt-4 space-y-2">
                            <div>
                                <div className="flex justify-between text-xs mb-1"><span className="text-gray-600">Similarity</span><span className="font-medium">{result.vector_score}%</span></div>
                                <div className="w-full bg-gray-200 rounded-full h-2"><div className={`h-2 rounded-full ${getMatchBgColor(result.vector_score)}`} style={{ width: `${result.vector_score}%` }}/></div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs mb-1"><span className="text-gray-600">AI Relevancy</span><span className="font-medium">{result.ai_relevancy}%</span></div>
                                <div className="w-full bg-gray-200 rounded-full h-2"><div className={`h-2 rounded-full ${getMatchBgColor(result.ai_relevancy)}`} style={{ width: `${result.ai_relevancy}%` }}/></div>
                            </div>
                        </div>
                    </div>
                 ))
              )}
            </div>
          </div>
        )}

        {/* Manage Admins Tab Content (Conditional) */}
        {activeTab === 'manageAdmins' && admin?.isSuperAdmin && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-6">Promote User to Admin</h2>
            <div className="space-y-4">
              {candidateUsers.length === 0 ? (<p className="text-gray-600">No candidate users available to promote.</p>) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    {/* ... Table Headers ... */}
                     <thead className="bg-gray-50"><tr><th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th><th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th><th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th></tr></thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {candidateUsers.map((cUser) => (
                        <tr key={cUser._id}>
                           <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cUser.name}</td>
                           <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cUser.email}</td>
                           <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button onClick={() => handlePromoteUser(cUser._id, cUser.name)} className="text-indigo-600 hover:text-indigo-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                              Promote to Admin
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div> {/* End max-w-7xl container */}
    </div> // End min-h-screen
  );
};

export default Dashboard;