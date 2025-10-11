import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { nodeAPI, pythonAPI } from '../config/api';
import { Upload, FileText, Briefcase, User, LogOut, Edit } from 'lucide-react';

const CandidateDashboard = () => {
    const { user, logout } = useAuth();
    const [jobs, setJobs] = useState([]);
    const [profile, setProfile] = useState(null);
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState({});

    useEffect(() => {
        fetchJobs();
        fetchProfile();
    }, []);

    const fetchJobs = async () => {
        try {
            const res = await nodeAPI.get('/jobs');
            setJobs(res.data.jobs);
        } catch (error) {
            console.error('Error fetching jobs:', error);
        }
    };

    const fetchProfile = async () => {
        try {
            const res = await pythonAPI.get('/profile');
            setProfile(res.data.profile);
            setEditData(res.data.profile || {});
        } catch (error) {
            console.error('Error fetching profile:', error);
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
            fetchProfile();
            setFile(null);
            alert('Resume uploaded successfully!');
        } catch (error) {
            alert('Error uploading resume');
        } finally {
            setUploading(false);
        }
    };

    const handleApplyJob = async (jobId) => {
        try {
            await nodeAPI.post(`/jobs/${jobId}/apply`);
            alert('Application submitted successfully!');
        } catch (error) {
            alert('Error applying to job');
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        try {
            await pythonAPI.put('/profile', editData);
            fetchProfile();
            setEditMode(false);
            alert('Profile updated successfully!');
        } catch (error) {
            alert('Error updating profile');
        }
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
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Profile Section */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg shadow p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold flex items-center">
                                    <User className="h-5 w-5 mr-2" />
                                    Profile
                                </h2>
                                {profile && (
                                    <button
                                        onClick={() => setEditMode(!editMode)}
                                        className="text-indigo-600 hover:text-indigo-700"
                                    >
                                        <Edit className="h-5 w-5" />
                                    </button>
                                )}
                            </div>

                            {!profile ? (
                                <form onSubmit={handleFileUpload} className="space-y-4">
                                    <p className="text-gray-600">Upload your resume to get started</p>
                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
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
                                            className="cursor-pointer text-indigo-600 hover:text-indigo-700"
                                        >
                                            Choose PDF or DOCX file
                                        </label>
                                        {file && <p className="mt-2 text-sm text-gray-600">{file.name}</p>}
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={!file || uploading}
                                        className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        {uploading ? 'Uploading...' : 'Upload Resume'}
                                    </button>
                                </form>
                            ) : editMode ? (
                                <form onSubmit={handleUpdateProfile} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
                                        <input
                                            type="text"
                                            value={editData.skills || ''}
                                            onChange={(e) => setEditData({ ...editData, skills: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                            placeholder="Python, JavaScript, React"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Experience</label>
                                        <textarea
                                            value={editData.experience || ''}
                                            onChange={(e) => setEditData({ ...editData, experience: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                            rows="3"
                                        />
                                    </div>
                                    <div className="flex space-x-2">
                                        <button
                                            type="submit"
                                            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditMode(false)}
                                            className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div className="space-y-3">
                                    <div>
                                        <h3 className="text-sm font-medium text-gray-500">Skills</h3>
                                        <p className="text-gray-900">{profile.skills || 'Not provided'}</p>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-gray-500">Experience</h3>
                                        <p className="text-gray-900">{profile.experience || 'Not provided'}</p>
                                    </div>
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
                                    <p className="text-gray-600">No jobs available at the moment</p>
                                ) : (
                                    jobs.map((job) => (
                                        <div key={job._id} className="border border-gray-200 rounded-lg p-4">
                                            <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
                                            <p className="text-indigo-600 font-medium">{job.company}</p>
                                            <p className="text-gray-600 mt-2">{job.description}</p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                                                    {job.role}
                                                </span>
                                                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                                                    ₹{job.salary}
                                                </span>
                                            </div>
                                            {profile && job.matchScore && (
                                                <div className="mt-3">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-sm font-medium text-gray-700">Match Score</span>
                                                        <span className="text-sm font-semibold text-indigo-600">
                                                            {job.matchScore}%
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                                        <div
                                                            className="bg-indigo-600 h-2 rounded-full"
                                                            style={{ width: `${job.matchScore}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            <button
                                                onClick={() => handleApplyJob(job._id)}
                                                className="mt-4 w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                                            >
                                                Apply Now
                                            </button>
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