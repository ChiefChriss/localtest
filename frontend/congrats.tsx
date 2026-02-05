import { useNavigate, Link } from 'react-router-dom';

const Congrats = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    navigate('/login');
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-black overflow-hidden font-sans selection:bg-purple-500 selection:text-white">

      {/* --- Liquid Background Effects --- */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      {/* --- Glass Card --- */}
      <div className="relative z-10 w-full max-w-lg p-10 mx-4 bg-white/5 backdrop-blur-3xl backdrop-saturate-200 border border-white/10 rounded-3xl shadow-[0_0_40px_8px_rgba(0,0,0,0.5)] flex flex-col items-center gap-8 ring-1 ring-white/10 text-center">

        {/* Logo/Header */}
        <div className="space-y-4">
          <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 tracking-tighter animate-pulse">
            Sonara
          </h1>
          <h2 className="text-3xl font-bold text-white tracking-tight">
            Congrats, you're in!
          </h2>
          <p className="text-gray-400 text-lg font-light leading-relaxed max-w-xs mx-auto">
            You have successfully logged in and accessed the protected area.
          </p>
        </div>

        {/* Actions */}
        <div className="w-full flex flex-col gap-4">
          <Link
            to="/"
            className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-[0_4px_20px_rgba(168,85,247,0.3)] hover:shadow-[0_6px_25px_rgba(168,85,247,0.4)] hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span>Go to Home</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </Link>

          <button
            onClick={handleLogout}
            className="w-full py-4 px-6 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl transition-all border border-white/10 hover:border-white/20 hover:scale-[1.02] active:scale-[0.98]"
          >
            Logout
          </button>
        </div>

      </div>
    </div>
  );
};

export default Congrats;
