import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';

interface UserProfile {
    id: number;
    username: string;
    is_creator: boolean;
    is_listener: boolean;
    creator_since: string | null;
    profile_picture: string | null;
}

interface UploadFormData {
    title: string;
    genre: string;
    bpm: string;
    coverArt: File | null;
    coverArtPreview: string | null;
}

const GENRE_OPTIONS = [
    'Hip Hop', 'R&B', 'Pop', 'Electronic', 'Rock', 'Jazz',
    'Classical', 'Country', 'Reggae', 'Latin', 'Afrobeats', 'Other'
];

const Studio = () => {
    const navigate = useNavigate();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
    const [uploadForm, setUploadForm] = useState<UploadFormData>({
        title: '',
        genre: '',
        bpm: '',
        coverArt: null,
        coverArtPreview: null
    });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const coverArtInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchData = async () => {
            const accessToken = localStorage.getItem('accessToken');
            if (!accessToken) { navigate('/login'); return; }
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

            try {
                const profileRes = await fetch(`${API_BASE_URL}/api/auth/profile/`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (profileRes.ok) setProfile(await profileRes.json());
            } catch (error) {
                console.error("Error fetching studio data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [navigate]);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setSelectedAudioFile(file);
        setUploadForm({
            title: file.name.replace(/\.[^/.]+$/, ""),
            genre: '',
            bpm: '',
            coverArt: null,
            coverArtPreview: null
        });
        setShowUploadModal(true);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleCoverArtSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setUploadForm(prev => ({ ...prev, coverArt: file, coverArtPreview: URL.createObjectURL(file) }));
    };

    const handleUploadSubmit = async () => {
        if (!selectedAudioFile) return;
        setUploading(true);
        const accessToken = localStorage.getItem('accessToken');
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
        const formData = new FormData();
        formData.append('audio_file', selectedAudioFile);
        formData.append('title', uploadForm.title || 'Untitled Track');
        if (uploadForm.genre) formData.append('genre', uploadForm.genre);
        if (uploadForm.bpm) formData.append('bpm', uploadForm.bpm);
        if (uploadForm.coverArt) formData.append('cover_art', uploadForm.coverArt);

        try {
            const response = await fetch(`${API_BASE_URL}/api/music/tracks/`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: formData
            });

            if (response.ok) {
                alert("Upload successful!");
                closeUploadModal();
                navigate('/my-songs'); // Redirect to my songs after upload
            } else {
                alert("Upload failed! Please check if the info is valid.");
            }
        } catch (error) {
            console.error("Error uploading track:", error);
            alert("Error uploading track");
        } finally {
            setUploading(false);
        }
    };

    const closeUploadModal = () => {
        setShowUploadModal(false);
        setSelectedAudioFile(null);
        if (uploadForm.coverArtPreview) URL.revokeObjectURL(uploadForm.coverArtPreview);
        setUploadForm({ title: '', genre: '', bpm: '', coverArt: null, coverArtPreview: null });
    };

    if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-6 h-6 border-2 border-purple-500 rounded-full animate-spin border-t-transparent"></div></div>;

    return (
        <div className="min-h-screen w-full bg-black text-white font-sans selection:bg-purple-500 selection:text-white flex">
            <Sidebar profile={profile} />
            <div className="flex-grow ml-16 md:ml-64 p-8 relative">
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                    <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-purple-900/20 rounded-full mix-blend-screen filter blur-[120px] opacity-30"></div>
                </div>
                <div className="relative z-10 max-w-5xl mx-auto space-y-8 h-full flex flex-col items-center justify-center pt-20">
                    <div className="text-center space-y-4">
                        <h1 className="text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                            Creator Studio
                        </h1>
                        <p className="text-xl text-gray-400 max-w-lg mx-auto">
                            Upload your latest creation or manage your existing tracks.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mt-12">
                        {/* Upload Card */}
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="group relative overflow-hidden bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-all cursor-pointer hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-900/20"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="text-9xl">☁️</span>
                            </div>
                            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                                <div className="w-20 h-20 bg-purple-600/20 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <span className="text-4xl text-purple-400">+</span>
                                </div>
                                <h3 className="text-2xl font-bold">Upload New Track</h3>
                                <p className="text-gray-400">Drag & drop or click to upload your audio file (MP3, WAV).</p>
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="audio/*" className="hidden" />
                        </div>

                        {/* My Songs Card */}
                        <div
                            onClick={() => navigate('/my-songs')}
                            className="group relative overflow-hidden bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-all cursor-pointer hover:border-pink-500/50 hover:shadow-2xl hover:shadow-pink-900/20"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <span className="text-9xl">🎵</span>
                            </div>
                            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                                <div className="w-20 h-20 bg-pink-600/20 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <span className="text-4xl text-pink-400">☰</span>
                                </div>
                                <h3 className="text-2xl font-bold">My Songs</h3>
                                <p className="text-gray-400">View analytics, edit details, and manage your published tracks.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeUploadModal} />
                    <div className="relative bg-gray-900/95 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl shadow-purple-900/20">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-white">Upload Track</h2>
                            <button onClick={closeUploadModal} className="text-gray-400 hover:text-white transition-colors text-2xl">×</button>
                        </div>
                        <div className={`bg-white/5 border border-white/10 rounded-xl p-4 mb-6`}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center text-purple-400">🎵</div>
                                <div className="flex-1 min-w-0"><p className="text-white font-medium truncate">{selectedAudioFile ? selectedAudioFile.name : ''}</p></div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div><label className="block text-sm font-medium text-gray-300 mb-2">Title *</label><input type="text" value={uploadForm.title} onChange={(e) => setUploadForm(prev => ({ ...prev, title: e.target.value }))} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white" /></div>
                            <div><label className="block text-sm font-medium text-gray-300 mb-2">Genre</label><select value={uploadForm.genre} onChange={(e) => setUploadForm(prev => ({ ...prev, genre: e.target.value }))} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white bg-gray-900"><option value="">Select a genre</option>{GENRE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}</select></div>
                            <div><label className="block text-sm font-medium text-gray-300 mb-2">BPM</label><input type="number" value={uploadForm.bpm} onChange={(e) => setUploadForm(prev => ({ ...prev, bpm: e.target.value }))} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white" /></div>
                            <div><label className="block text-sm font-medium text-gray-300 mb-2">Cover Art</label><input type="file" ref={coverArtInputRef} onChange={handleCoverArtSelect} accept="image/*" className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700" /></div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={closeUploadModal} className="flex-1 py-3 px-6 bg-white/5 hover:bg-white/10 text-white rounded-xl">Cancel</button>
                            <button onClick={handleUploadSubmit} disabled={uploading} className="flex-1 py-3 px-6 bg-purple-600 hover:bg-purple-500 text-white rounded-xl">{uploading ? 'Uploading...' : 'Upload'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
export default Studio;
