import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AudioPlayer from './components/AudioPlayer';
import Logo from './components/Logo';

interface UserProfile {
  id: number;
  username: string;
  email: string;
  profile_picture: string | null;
  is_creator: boolean;
}

interface Track {
  id: number;
  user: string;
  user_id: number;
  user_profile_picture: string | null;
  title: string;
  audio_file: string;
  cover_art: string | null;
  genre: string;
  bpm: number | null;
  duration: number | null;
  created_at: string;
  likes_count: number;
  is_liked: boolean;
}

const Liked = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

  useEffect(() => {
    const fetchData = async () => {
      const accessToken = localStorage.getItem('accessToken');
      if (!accessToken) {
        navigate('/login');
        return;
      }

      try {
        // Fetch profile
        const profileRes = await fetch(`${API_BASE_URL}/api/auth/profile/`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setProfile(profileData);
        } else {
          navigate('/login');
          return;
        }

        // Fetch liked tracks
        const likedRes = await fetch(`${API_BASE_URL}/api/music/liked/`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (likedRes.ok) {
          const likedData = await likedRes.json();
          setLikedTracks(likedData);
        }
      } catch (error) {
        console.error("Failed to fetch data", error);
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate, API_BASE_URL]);

  const handleUnlike = async (trackId: number) => {
    const accessToken = localStorage.getItem('accessToken');
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/music/tracks/${trackId}/like/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (res.ok) {
        // Remove from liked tracks
        setLikedTracks(prev => prev.filter(track => track.id !== trackId));
      }
    } catch (error) {
      console.error("Unlike failed", error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('username');
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 rounded-full animate-spin border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-black text-white font-sans selection:bg-purple-500 selection:text-white flex">
      
      {/* Sidebar */}
      <div className="w-16 md:w-64 border-r border-white/10 flex flex-col bg-black/50 backdrop-blur-xl h-screen fixed left-0 top-0 z-20">
        {/* Logo */}
        <div className="p-4 md:p-6 border-b border-white/5">
          <Link to="/">
            <Logo size="md" showText={false} className="md:hidden" />
            <Logo size="md" showText={true} className="hidden md:flex" />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 md:p-4 space-y-1">
          <Link 
            to="/" 
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="hidden md:block">Home</span>
          </Link>

          <Link 
            to="/liked" 
            className="flex items-center gap-3 p-3 rounded-xl bg-white/10 text-white font-medium"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span className="hidden md:block">Liked</span>
          </Link>

          {profile?.is_creator && (
            <Link 
              to="/studio" 
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <span className="hidden md:block">Studio</span>
            </Link>
          )}
        </nav>

        {/* User Profile Section */}
        <div className="p-2 md:p-4 border-t border-white/5">
          <Link 
            to={`/${profile?.username}`}
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-800 flex-shrink-0">
              {profile?.profile_picture ? (
                <img src={profile.profile_picture} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm font-medium">
                  {profile?.username?.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="hidden md:block flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{profile?.username}</p>
              <p className="text-xs text-gray-500 truncate">{profile?.is_creator ? 'Creator' : 'Listener'}</p>
            </div>
          </Link>
          
          <button 
            onClick={handleLogout}
            className="hidden md:flex items-center gap-3 w-full p-2 mt-2 rounded-xl hover:bg-white/5 text-gray-500 hover:text-red-400 transition-colors text-sm"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 ml-16 md:ml-64">
        {/* Header */}
        <header className="bg-gradient-to-b from-pink-900/30 to-transparent px-4 md:px-8 py-8 md:py-12">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 md:w-32 md:h-32 bg-gradient-to-br from-pink-600 to-purple-600 rounded-xl flex items-center justify-center shadow-2xl shadow-pink-900/30">
                <svg className="w-10 h-10 md:w-16 md:h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-400 uppercase tracking-wider mb-1">Playlist</p>
                <h1 className="text-3xl md:text-5xl font-bold text-white mb-2">Liked Songs</h1>
                <p className="text-gray-400">{likedTracks.length} {likedTracks.length === 1 ? 'song' : 'songs'}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Liked Tracks */}
        <main className="px-4 md:px-8 py-6">
          <div className="max-w-4xl mx-auto">
            {likedTracks.length > 0 ? (
              <div className="space-y-4">
                {likedTracks.map((track) => (
                  <div 
                    key={track.id}
                    className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/[0.07] transition-colors group"
                  >
                    <div className="flex items-start gap-4 mb-4">
                      {/* Cover Art */}
                      <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-gray-800 flex-shrink-0">
                        {track.cover_art ? (
                          <img src={track.cover_art} alt={track.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/50 to-pink-900/50">
                            <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Track Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-bold text-white text-lg truncate">{track.title}</h3>
                            <Link 
                              to={`/${track.user}`}
                              className="text-gray-400 hover:text-purple-400 text-sm transition-colors"
                            >
                              {track.user}
                            </Link>
                          </div>
                          
                          {/* Unlike Button */}
                          <button 
                            onClick={() => handleUnlike(track.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pink-500/20 text-pink-400 hover:bg-pink-500/30 transition-all"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            <span className="text-sm font-medium">{track.likes_count}</span>
                          </button>
                        </div>

                        {/* Meta Info */}
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                          <span>{new Date(track.created_at).toLocaleDateString()}</span>
                          {track.genre && (
                            <>
                              <span>•</span>
                              <span className="px-2 py-0.5 bg-white/5 rounded-full">{track.genre}</span>
                            </>
                          )}
                          {track.bpm && (
                            <>
                              <span>•</span>
                              <span>{track.bpm} BPM</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Audio Player */}
                    <AudioPlayer url={track.audio_file} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <div className="w-20 h-20 mx-auto mb-4 bg-white/5 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-gray-300 mb-2">No liked songs yet</h3>
                <p className="text-gray-500 mb-6">Start exploring and like songs you enjoy!</p>
                <Link 
                  to="/"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-full hover:from-purple-500 hover:to-pink-500 transition-all"
                >
                  Discover Music
                </Link>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Liked;
