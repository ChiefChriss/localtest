import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

interface UserProfile {
  id: number;
  username: string;
  email: string;
  profile_picture: string | null;
  is_creator: boolean;
  is_listener: boolean;
}

const Profile = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      const accessToken = localStorage.getItem('accessToken');
      if (!accessToken) {
        navigate('/login');
        return;
      }

      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

      try {
        // Fetch current authenticated user
        const response = await fetch(`${API_BASE_URL}/api/auth/profile/`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (response.ok) {
          const data = await response.json();
          setCurrentUser(data);
          // If viewing own profile or no username param, use own data
          if (!username || username === data.username) {
            setProfile(data);
          } else {
            // Fetch other user profile if implied (Not fully implemented on backend yet for public profiles, so defaulting to current user for safely)
            // In a real app we'd have a public profile endpoint
            setProfile(data);
          }
        } else {
          navigate('/login');
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate, username]);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('username');
    navigate('/login');
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const accessToken = localStorage.getItem('accessToken');
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

    const formData = new FormData();
    formData.append('profile_picture', file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/profile/`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: formData
      });

      if (response.ok) {
        const updatedProfile = await response.json();
        setProfile(updatedProfile);
        setCurrentUser(updatedProfile);
      } else {
        console.error("Failed to upload image");
      }
    } catch (error) {
      console.error("Error uploading image:", error);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-6 h-6 border-2 border-purple-500 rounded-full animate-spin border-t-transparent"></div></div>;
  }

  const handleBecomeCreator = async () => {
    const accessToken = localStorage.getItem('accessToken');
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/profile/`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_creator: true })
      });

      if (response.ok) {
        const updatedProfile = await response.json();
        setProfile(updatedProfile);
        // Refresh current user if needed
        if (currentUser && currentUser.username === updatedProfile.username) {
          setCurrentUser(updatedProfile);
        }
      }
    } catch (error) {
      console.error("Error becoming creator:", error);
    }
  };

  const isOwnProfile = !username || (currentUser && username === currentUser.username);

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-black overflow-hidden font-sans selection:bg-purple-500 selection:text-white">

      {/* --- Liquid Background Effects --- */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-900/60 rounded-full mix-blend-screen filter blur-[100px] opacity-40 animate-blob"></div>
        <div className="absolute top-[20%] right-[-10%] w-[400px] h-[400px] bg-blue-900/50 rounded-full mix-blend-screen filter blur-[100px] opacity-40 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-[600px] h-[600px] bg-purple-900/40 rounded-full mix-blend-screen filter blur-[100px] opacity-40 animate-blob animation-delay-4000"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black z-0"></div>
      </div>

      {/* --- Glass Card --- */}
      <div className="relative z-10 w-full max-w-lg p-10 mx-4 bg-white/5 backdrop-blur-3xl backdrop-contrast-125 border border-white/10 rounded-3xl shadow-[0_0_50px_-12px_rgba(124,58,237,0.25)] flex flex-col gap-8 ring-1 ring-white/10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="text-sm font-medium text-gray-400 hover:text-white transition-colors flex items-center gap-2 group"
          >
            <span className="transform group-hover:-translate-x-1 transition-transform">←</span>
            Back to Home
          </Link>
        </div>

        {/* Profile Info */}
        <div className="flex flex-col items-center">
          <div className="relative group">
            <div className={`w-32 h-32 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 p-1 mb-6 shadow-lg shadow-purple-900/40 relative z-10 overflow-hidden ${isOwnProfile ? 'cursor-pointer' : ''}`}
              onClick={() => isOwnProfile && fileInputRef.current?.click()}>
              <div className="w-full h-full rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                {profile?.profile_picture ? (
                  <img src={profile.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl text-gray-400">👤</span>
                )}
              </div>

              {/* Hover Overlay for Upload */}
              {isOwnProfile && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full">
                  <div className="text-white text-xs font-semibold uppercase tracking-wider">Change</div>
                </div>
              )}
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />

          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
            {profile?.username}
          </h1>
          <p className="text-blue-400 text-sm font-medium tracking-wide uppercase">
            {profile?.is_creator ? "Creator" : "Free Logic Member"}
          </p>
        </div>

        {/* Details List */}
        <div className="bg-white/5 rounded-2xl p-6 border border-white/5 space-y-4 shadow-inner">
          <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 last:pb-0 font-light">
            <span className="text-gray-400">Username</span>
            <span className="text-white font-medium">{profile?.username}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 last:pb-0 font-light">
            <span className="text-gray-400">Email</span>
            <span className="text-white font-medium">{profile?.email}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 last:pb-0 font-light">
            <span className="text-gray-400">Role</span>
            <span className={`text-white font-medium ${profile?.is_creator ? 'text-purple-400' : 'text-gray-400'}`}>
              {profile?.is_creator ? 'Creator' : 'Listener'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {isOwnProfile && !profile?.is_creator && (
            <button
              onClick={handleBecomeCreator}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-900/20"
            >
              Become a Creator
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full py-3.5 px-6 bg-white/5 hover:bg-white/10 text-red-400 hover:text-red-300 font-semibold rounded-xl transition-all border border-white/10 hover:border-red-500/30 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]"
          >
            Logout
          </button>
        </div>

      </div>
    </div>
  );
};

export default Profile;
