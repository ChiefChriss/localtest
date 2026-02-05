import { Link, useLocation, useNavigate } from 'react-router-dom';
import Logo from './Logo';

interface SidebarProps {
    profile: {
        username: string;
        is_creator: boolean;
        profile_picture: string | null;
    } | null;
}

const Sidebar = ({ profile }: SidebarProps) => {
    const location = useLocation();
    const navigate = useNavigate();
    const activePath = location.pathname;

    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('username');
        navigate('/login');
    };

    return (
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
                    className={`flex items-center gap-3 p-3 rounded-xl font-medium transition-colors ${activePath === '/' ? 'bg-purple-600/20 text-purple-300' : 'hover:bg-white/5 text-gray-400 hover:text-white'
                        }`}
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    <span className="hidden md:block">Home</span>
                </Link>

                <Link
                    to="/liked"
                    className={`flex items-center gap-3 p-3 rounded-xl font-medium transition-colors ${activePath === '/liked' ? 'bg-purple-600/20 text-purple-300' : 'hover:bg-white/5 text-gray-400 hover:text-white'
                        }`}
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    <span className="hidden md:block">Liked</span>
                </Link>

                {profile?.is_creator && (
                    <>
                        <Link
                            to="/my-songs"
                            className={`flex items-center gap-3 p-3 rounded-xl font-medium transition-colors ${activePath === '/my-songs' ? 'bg-purple-600/20 text-purple-300' : 'hover:bg-white/5 text-gray-400 hover:text-white'
                                }`}
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                            <span className="hidden md:block">My Songs</span>
                        </Link>

                        <Link
                            to="/studio"
                            className={`flex items-center gap-3 p-3 rounded-xl font-medium transition-colors ${activePath === '/studio' ? 'bg-purple-600/20 text-purple-300' : 'hover:bg-white/5 text-gray-400 hover:text-white'
                                }`}
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                            </svg>
                            <span className="hidden md:block">Studio</span>
                        </Link>
                    </>
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
    );
};

export default Sidebar;
