import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AudioPlayer from './components/AudioPlayer';
import Sidebar from './components/Sidebar';
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
  listens_count: number;
}

const Home = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeView, setActiveView] = useState<'feed' | 'search'>('feed');

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
          localStorage.setItem('username', profileData.username);
        } else {
          navigate('/login');
          return;
        }

        // Fetch feed
        const feedRes = await fetch(`${API_BASE_URL}/api/music/feed/`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (feedRes.ok) {
          const feedData = await feedRes.json();
          setTracks(feedData);
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

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setActiveView('feed');
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setActiveView('search');
    const accessToken = localStorage.getItem('accessToken');

    try {
      const res = await fetch(`${API_BASE_URL}/api/music/search/?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Search results:', data); // Debug log
        setSearchResults(data);
      } else {
        console.error('Search failed with status:', res.status);
      }
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setIsSearching(false);
    }
  }, [API_BASE_URL]);

  const handleLike = async (trackId: number) => {
    const accessToken = localStorage.getItem('accessToken');

    try {
      const res = await fetch(`${API_BASE_URL}/api/music/tracks/${trackId}/like/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (res.ok) {
        const data = await res.json();

        // Update tracks in feed
        setTracks(prev => prev.map(track =>
          track.id === trackId
            ? { ...track, is_liked: data.liked, likes_count: data.likes_count }
            : track
        ));

        // Update search results if active
        setSearchResults(prev => prev.map(track =>
          track.id === trackId
            ? { ...track, is_liked: data.liked, likes_count: data.likes_count }
            : track
        ));
      }
    } catch (error) {
      console.error("Like failed", error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('username');
    navigate('/login');
  };

  const handleListenUpdate = (trackId: number, newCount: number) => {
    // Update tracks in feed
    setTracks(prev => prev.map(track =>
      track.id === trackId
        ? { ...track, listens_count: newCount }
        : track
    ));

    // Update search results if active
    setSearchResults(prev => prev.map(track =>
      track.id === trackId
        ? { ...track, listens_count: newCount }
        : track
    ));
  };

  const displayTracks = activeView === 'search' ? searchResults : tracks;

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
      <Sidebar profile={profile} />

      {/* Main Content */}
      <div className="flex-1 ml-16 md:ml-64">
        {/* Header with Search */}
        <header className="sticky top-0 z-10 bg-black/80 backdrop-blur-xl border-b border-white/5 px-4 md:px-8 py-4">
          <div className="max-w-4xl mx-auto">
            <div className="relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search tracks, artists, genres..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleSearch(e.target.value);
                }}
                className="w-full bg-white/5 border border-white/10 rounded-full pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setActiveView('feed');
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Feed Content */}
        <main className="px-4 md:px-8 py-6">
          <div className="max-w-4xl mx-auto">
            {/* Section Title */}
            <div className="mb-6">
              <h1 className="text-2xl md:text-3xl font-bold text-white">
                {activeView === 'search'
                  ? (searchResults.length > 0 ? `Results for "${searchQuery}"` : `No results for "${searchQuery}"`)
                  : 'Discover'}
              </h1>
              {activeView === 'feed' && (
                <p className="text-gray-500 mt-1">Fresh tracks from creators</p>
              )}
            </div>

            {/* Loading State */}
            {isSearching && (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-purple-500 rounded-full animate-spin border-t-transparent"></div>
              </div>
            )}

            {/* Tracks Grid */}
            {!isSearching && displayTracks.length > 0 && (
              <div className="space-y-4">
                {displayTracks.map((track) => (
                  <TrackCard
                    key={track.id}
                    track={track}
                    onLike={handleLike}
                    onListenUpdate={handleListenUpdate}
                  />
                ))}
              </div>
            )}

            {/* Empty State */}
            {!isSearching && displayTracks.length === 0 && activeView === 'feed' && (
              <div className="text-center py-20">
                <div className="w-20 h-20 mx-auto mb-4 bg-white/5 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-gray-300 mb-2">No tracks yet</h3>
                <p className="text-gray-500">Be the first to upload some music!</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

// Track Card Component
interface TrackCardProps {
  track: Track;
  onLike: (trackId: number) => void;
  onListenUpdate?: (trackId: number, newCount: number) => void;
}

const TrackCard = ({ track, onLike, onListenUpdate }: TrackCardProps) => {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/[0.07] transition-colors group">
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

            {/* Like Button */}
            <button
              onClick={() => onLike(track.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${track.is_liked
                ? 'bg-pink-500/20 text-pink-400'
                : 'bg-white/5 text-gray-400 hover:text-pink-400 hover:bg-pink-500/10'
                }`}
            >
              <svg
                className="w-4 h-4"
                fill={track.is_liked ? "currentColor" : "none"}
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span className="text-sm font-medium">{track.likes_count}</span>
            </button>
          </div>

          {/* Meta Info */}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            {/* Listen Count */}
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {track.listens_count}
            </span>
            <span>•</span>
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
      <AudioPlayer 
        url={track.audio_file} 
        trackId={track.id}
        onListenRecorded={(newCount) => onListenUpdate?.(track.id, newCount)}
      />
    </div>
  );
};

export default Home;
