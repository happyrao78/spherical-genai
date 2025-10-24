import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { nodeAPI, pythonAPI } from '../config/api';
import { Briefcase, Users, Search, LogOut, Plus, Loader } from 'lucide-react';

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobForm, setJobForm] = useState({
    title: '',
    company: '',
    description: '',
    role: '',
    salary: '',
    requirements: '',
  });

  useEffect(() => {
    fetchJobs();
    fetchApplications();
  }, []);

  const fetchJobs = async () => {
    try {
      const res = await nodeAPI.get('/admin/jobs');
      setJobs(res.data.jobs);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  const fetchApplications = async () => {
    try {
      const res = await nodeAPI.get('/admin/applications');
      setApplications(res.data.applications);
    } catch (error) {
      console.error('Error fetching applications:', error);
    }
  };

  const handleCreateJob = async (e) => {
    e.preventDefault();
    try {
      await nodeAPI.post('/admin/jobs', jobForm);
      setShowJobForm(false);
      setJobForm({
        title: '',
        company: '',
        description: '',
        role: '',
        salary: '',
        requirements: '',
      });
      fetchJobs();
      alert('Job posted successfully!');
    } catch (error) {
      alert('Error creating job');
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
      // Call the Node.js server proxy instead of calling the Python service directly
      // This avoids CORS issues because the browser talks only to our domain
      const res = await nodeAPI.post('/semantic-search', { query: searchQuery });
      setSearchResults(res.data.results || []);
      
      if (res.data.results.length === 0) {
        alert('No matching candidates found');
      }
    } catch (error) {
      console.error('Search error:', error);
      alert('Error performing search');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-purple-600">Admin Portal</h1>
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
        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('jobs')}
              className={`flex-1 py-4 px-6 text-center font-medium ${
                activeTab === 'jobs'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Briefcase className="h-5 w-5 inline mr-2" />
              Job Postings
            </button>
            <button
              onClick={() => setActiveTab('applications')}
              className={`flex-1 py-4 px-6 text-center font-medium ${
                activeTab === 'applications'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="h-5 w-5 inline mr-2" />
              Applications
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`flex-1 py-4 px-6 text-center font-medium ${
                activeTab === 'search'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Search className="h-5 w-5 inline mr-2" />
              Semantic Search
            </button>
          </div>
        </div>

        {/* Jobs Tab */}
        {activeTab === 'jobs' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Job Postings</h2>
              <button
                onClick={() => setShowJobForm(!showJobForm)}
                className="flex items-center bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                New Job
              </button>
            </div>

            {showJobForm && (
              <form onSubmit={handleCreateJob} className="mb-6 p-4 border border-gray-200 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                    <input
                      type="text"
                      value={jobForm.title}
                      onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                    <input
                      type="text"
                      value={jobForm.company}
                      onChange={(e) => setJobForm({ ...jobForm, company: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <input
                      type="text"
                      value={jobForm.role}
                      onChange={(e) => setJobForm({ ...jobForm, role: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salary (CTC)</label>
                    <input
                      type="text"
                      value={jobForm.salary}
                      onChange={(e) => setJobForm({ ...jobForm, salary: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={jobForm.description}
                      onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      rows="3"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Requirements</label>
                    <textarea
                      value={jobForm.requirements}
                      onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      rows="2"
                    />
                  </div>
                </div>
                <div className="mt-4 flex space-x-2">
                  <button
                    type="submit"
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
                  >
                    Create Job
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowJobForm(false)}
                    className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-4">
              {jobs.length === 0 ? (
                <p className="text-gray-600">No jobs posted yet</p>
              ) : (
                jobs.map((job) => (
                  <div key={job._id} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
                    <p className="text-purple-600 font-medium">{job.company}</p>
                    <p className="text-gray-600 mt-2">{job.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                        {job.role}
                      </span>
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                        ₹{job.salary}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Applications Tab */}
        {activeTab === 'applications' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-6">Applications</h2>
            <div className="space-y-4">
              {applications.length === 0 ? (
                <p className="text-gray-600">No applications yet</p>
              ) : (
                applications.map((app) => (
                  <div key={app._id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {app.candidate?.name}
                        </h3>
                        <p className="text-gray-600">{app.candidate?.email}</p>
                        <p className="text-purple-600 font-medium mt-2">
                          Applied for: {app.job?.title}
                        </p>
                        {app.matchScore && (
                          <div className="mt-2">
                            <span className="text-sm font-medium text-gray-700">
                              Match Score: <span className="text-purple-600">{app.matchScore}%</span>
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                        {app.status}
                      </span>
                    </div>
                    {app.candidate?.skills && (
                      <div className="mt-3">
                        <p className="text-sm font-medium text-gray-700">Skills:</p>
                        <p className="text-gray-600">{app.candidate.skills}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Semantic Search Tab */}
        {activeTab === 'search' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-6">Semantic Candidate Search</h2>
            <form onSubmit={handleSemanticSearch} className="mb-6">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g., user with experience in management systems"
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
              {searching ? (
                <div className="text-center py-8">
                  <Loader className="h-8 w-8 animate-spin mx-auto text-purple-600" />
                  <p className="mt-2 text-gray-600">Searching candidates...</p>
                </div>
              ) : searchResults.length === 0 ? (
                <p className="text-gray-600">Enter a search query to find candidates</p>
              ) : (
                searchResults.map((result, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">{result.name || 'Unknown'}</h3>
                        <p className="text-gray-600">{result.email}</p>
                        
                        {result.skills && (
                          <div className="mt-2">
                            <p className="text-sm font-medium text-gray-700">Skills:</p>
                            <p className="text-gray-600">{result.skills}</p>
                          </div>
                        )}
                        
                        {result.experience && (
                          <div className="mt-2">
                            <p className="text-sm font-medium text-gray-700">Experience:</p>
                            <p className="text-gray-600">{result.experience}</p>
                          </div>
                        )}

                        {result.education && (
                          <div className="mt-2">
                            <p className="text-sm font-medium text-gray-700">Education:</p>
                            <p className="text-gray-600">{result.education}</p>
                          </div>
                        )}

                        {result.years_experience && (
                          <div className="mt-2">
                            <p className="text-sm font-medium text-gray-700">Years of Experience:</p>
                            <p className="text-gray-600">{result.years_experience}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="ml-4 text-right">
                        <div className="mb-2">
                          <span className="text-xs font-medium text-gray-500">Final Score</span>
                          <div className="text-3xl font-bold text-purple-600">
                            {result.final_score}%
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 space-y-1">
                          <div>Vector: {result.vector_score}%</div>
                          <div>AI: {result.ai_relevancy}%</div>
                        </div>
                      </div>
                    </div>

                    {/* Score Bars */}
                    <div className="mt-4 space-y-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600">Similarity Match</span>
                          <span className="font-medium">{result.vector_score}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${result.vector_score}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600">AI Relevancy</span>
                          <span className="font-medium">{result.ai_relevancy}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: `${result.ai_relevancy}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;