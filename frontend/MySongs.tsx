import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AudioPlayer from './components/AudioPlayer';
import Sidebar from './components/Sidebar';

interface Track {
    id: number;
    title: string;
    audio_file: string;
    cover_art: string | null;
    genre: string;
    bpm: number | null;
    duration: number | null;
    created_at: string;
    likes_count: number;
    reposts_count: number;
    listens_count: number;
}

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

const MySongs = () => {
    const navigate = useNavigate();
    const [tracks, setTracks] = useState<Track[]>([]);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [trackToDelete, setTrackToDelete] = useState<number | null>(null);
    const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
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

                const tracksRes = await fetch(`${API_BASE_URL}/api/music/tracks/`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (tracksRes.ok) setTracks(await tracksRes.json());
            } catch (error) {
                console.error("Error fetching data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [navigate]);

    const handleCoverArtSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setUploadForm(prev => ({ ...prev, coverArt: file, coverArtPreview: URL.createObjectURL(file) }));
    };

    const handleUploadSubmit = async () => {
        if (!editingTrackId) return; // Only used for editing in this view
        setUploading(true);
        const accessToken = localStorage.getItem('accessToken');
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
        const formData = new FormData();
        formData.append('title', uploadForm.title || 'Untitled Track');
        if (uploadForm.genre) formData.append('genre', uploadForm.genre);
        if (uploadForm.bpm) formData.append('bpm', uploadForm.bpm);
        if (uploadForm.coverArt) formData.append('cover_art', uploadForm.coverArt);

        try {
            const response = await fetch(`${API_BASE_URL}/api/music/tracks/${editingTrackId}/`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: formData
            });

            if (response.ok) {
                const responseData = await response.json();
                setTracks(tracks.map(t => t.id === editingTrackId ? responseData : t));
                closeUploadModal();
            } else {
                alert(`Update failed!`);
            }
        } catch (error) {
            console.error(`Error updating track:`, error);
            alert(`Error updating track`);
        } finally {
            setUploading(false);
        }
    };

    const confirmDeleteTrack = (trackId: number) => {
        setTrackToDelete(trackId);
        setShowDeleteModal(true);
    };

    const handleDeleteTrack = async () => {
        if (!trackToDelete) return;
        const accessToken = localStorage.getItem('accessToken');
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

        try {
            const response = await fetch(`${API_BASE_URL}/api/music/tracks/${trackToDelete}/`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (response.ok) {
                setTracks(tracks.filter(t => t.id !== trackToDelete));
                setShowDeleteModal(false);
                setTrackToDelete(null);
            } else {
                alert("Failed to delete track.");
            }
        } catch (error) {
            console.error("Error deleting track:", error);
            alert("Error deleting track");
        }
    };

    const handleEditClick = (track: Track) => {
        setEditingTrackId(track.id);
        setUploadForm({
            title: track.title,
            genre: track.genre || '',
            bpm: track.bpm ? track.bpm.toString() : '',
            coverArt: null,
            coverArtPreview: track.cover_art
        });
        setShowUploadModal(true);
    };

    const closeUploadModal = () => {
        setShowUploadModal(false);
        setEditingTrackId(null);
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
                <div className="relative z-10 max-w-5xl mx-auto space-y-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-4xl font-bold tracking-tight">My Songs</h1>
                            <p className="text-gray-400 mt-1">Your uploaded tracks and analytics.</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {tracks.length === 0 ? (
                            <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl bg-white/5">
                                <p className="text-2xl mb-2">🎵</p>
                                <h3 className="text-xl font-medium text-gray-300">No tracks yet</h3>
                                <p className="text-gray-500 text-sm">Go to Studio to upload your first track.</p>
                            </div>
                        ) : (
                            tracks.map(track => (
                                <div key={track.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-colors">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-gray-800 rounded-lg overflow-hidden">
                                                {track.cover_art ? (
                                                    <img src={track.cover_art} alt={track.title} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">NO ART</div>
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-lg">{track.title}</h3>
                                                <div className="text-xs text-gray-400 flex gap-2">
                                                    <span>{new Date(track.created_at).toLocaleDateString()}</span>
                                                    {track.bpm && <span>• {track.bpm} BPM</span>}
                                                    {track.genre && <span>• {track.genre}</span>}
                                                </div>
                                                <div className="flex gap-4 mt-2 text-xs text-gray-400">
                                                    <div className="flex items-center gap-1" title="Likes"><span>❤️</span><span>{track.likes_count || 0}</span></div>
                                                    <div className="flex items-center gap-1" title="Reposts"><span>🔁</span><span>{track.reposts_count || 0}</span></div>
                                                    <div className="flex items-center gap-1" title="Listens"><span>🎧</span><span>{track.listens_count || 0}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleEditClick(track)} className="text-gray-400 hover:text-white px-3 py-1 text-sm bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">Edit</button>
                                            <button onClick={() => confirmDeleteTrack(track.id)} className="text-red-400 hover:text-red-300 px-3 py-1 text-sm bg-red-500/10 rounded-lg border border-red-500/10 hover:bg-red-500/20 transition-colors">Delete</button>
                                        </div>
                                    </div>
                                    <AudioPlayer url={track.audio_file} />
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
            {/* Modals omitted for brevity, reusing same modal structure or extracting modal component would be better but keeping it simple for now */}
            {showUploadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeUploadModal} />
                    <div className="relative bg-gray-900/95 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl shadow-purple-900/20">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-white">Edit Track</h2>
                            <button onClick={closeUploadModal} className="text-gray-400 hover:text-white transition-colors text-2xl">×</button>
                        </div>
                        <div className="space-y-4">
                            <div><label className="block text-sm font-medium text-gray-300 mb-2">Title *</label><input type="text" value={uploadForm.title} onChange={(e) => setUploadForm(prev => ({ ...prev, title: e.target.value }))} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white" /></div>
                            <div><label className="block text-sm font-medium text-gray-300 mb-2">Genre</label><select value={uploadForm.genre} onChange={(e) => setUploadForm(prev => ({ ...prev, genre: e.target.value }))} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white bg-gray-900"><option value="">Select a genre</option>{GENRE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}</select></div>
                            <div><label className="block text-sm font-medium text-gray-300 mb-2">BPM</label><input type="number" value={uploadForm.bpm} onChange={(e) => setUploadForm(prev => ({ ...prev, bpm: e.target.value }))} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white" /></div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={closeUploadModal} className="flex-1 py-3 px-6 bg-white/5 hover:bg-white/10 text-white rounded-xl">Cancel</button>
                            <button onClick={handleUploadSubmit} disabled={uploading} className="flex-1 py-3 px-6 bg-purple-600 hover:bg-purple-500 text-white rounded-xl">{uploading ? 'Saving...' : 'Save Changes'}</button>
                        </div>
                    </div>
                </div>
            )}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)} />
                    <div className="relative bg-gray-900 border border-white/10 rounded-2xl p-8 w-full max-w-md text-center">
                        <h3 className="text-2xl font-bold text-white mb-2">Delete Track?</h3>
                        <div className="flex gap-3 mt-6"><button onClick={() => setShowDeleteModal(false)} className="flex-1 py-3 px-6 bg-white/5 rounded-xl">Cancel</button><button onClick={handleDeleteTrack} className="flex-1 py-3 px-6 bg-red-600 rounded-xl">Delete</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};
export default MySongs;
