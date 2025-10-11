import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Users, Briefcase, Sparkles } from 'lucide-react';

const Home = () => {
  const [text, setText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [loopNum, setLoopNum] = useState(0);
  const [typingSpeed, setTypingSpeed] = useState(150);

  const words = ['Dream Job', 'Perfect Career', 'Future', 'Opportunity'];

  useEffect(() => {
    const handleType = () => {
      const i = loopNum % words.length;
      const fullText = words[i];

      setText(
        isDeleting
          ? fullText.substring(0, text.length - 1)
          : fullText.substring(0, text.length + 1)
      );

      setTypingSpeed(isDeleting ? 50 : 150);

      if (!isDeleting && text === fullText) {
        setTimeout(() => setIsDeleting(true), 2000);
      } else if (isDeleting && text === '') {
        setIsDeleting(false);
        setLoopNum(loopNum + 1);
      }
    };

    const timer = setTimeout(handleType, typingSpeed);
    return () => clearTimeout(timer);
  }, [text, isDeleting, loopNum, typingSpeed, words]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Navbar */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Sparkles className="h-8 w-8 text-indigo-600" />
              <span className="ml-2 text-2xl font-bold text-gray-900">Spherical</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/candidate/login"
                className="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium"
              >
                Candidate Login
              </Link>
              <Link
                to="/admin/login"
                className="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium"
              >
                Admin Login
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-5xl font-bold text-gray-900 mb-6">
              Find Your{' '}
              <span className="text-indigo-600">
                {text}
                <span className="animate-pulse">|</span>
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              AI-powered recruitment platform that matches candidates with their perfect opportunities using advanced semantic search and intelligent matching.
            </p>
            <Link
              to="/candidate/signup"
              className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Get Started
              <ChevronRight className="ml-2 h-5 w-5" />
            </Link>
          </div>
          <div className="relative">
            <img
              src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=600&fit=crop"
              alt="Team collaboration"
              className="rounded-lg shadow-2xl"
            />
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <Users className="h-12 w-12 text-indigo-600 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Smart Matching</h3>
            <p className="text-gray-600">
              AI-powered algorithms match your skills with the perfect job opportunities
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <Briefcase className="h-12 w-12 text-indigo-600 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Easy Applications</h3>
            <p className="text-gray-600">
              Upload your resume once and apply to multiple jobs with a single click
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <Sparkles className="h-12 w-12 text-indigo-600 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Semantic Search</h3>
            <p className="text-gray-600">
              Advanced NLP technology understands your experience and finds relevant matches
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;