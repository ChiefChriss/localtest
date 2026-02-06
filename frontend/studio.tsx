import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as Tone from "tone";
import Logo from './components/Logo';
import { generateWaveform } from './utils/waveform';

// --- CONSTANTS ---
const PX_PER_SEC = 50;
const SNAP_GRID = 0.25; // Snap to quarter notes

interface Clip {
    id: string;
    url: string;
    fileId?: number;
    startTime: number;
    duration: number;
    name: string;
    waveformData?: number[];
    color?: string;
}

interface Track {
    id: string;
    name: string;
    isMuted: boolean;
    isSolo: boolean;
    volume: number; // dB (-60 to +25)
    pan: number;
    clips: Clip[];
}

interface ProjectSummary {
    id: number;
    title: string;
    bpm: number;
    last_updated: string;
}

export default function Studio() {
    const navigate = useNavigate();
    const { id } = useParams();
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

    // --- GLOBAL STATE ---
    const [activeTab, setActiveTab] = useState<'create' | 'upload'>('create');
    const [loading, setLoading] = useState(true);
    const [projectTitle, setProjectTitle] = useState("Untitled Project");
    const [projectId, setProjectId] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [showLoadModal, setShowLoadModal] = useState(false);
    const [savedProjects, setSavedProjects] = useState<ProjectSummary[]>([]);

    // --- DAW STATE ---
    const [tracks, setTracks] = useState<Track[]>([
        { id: "1", name: "Beat", isMuted: false, isSolo: false, volume: -6, pan: 0, clips: [] },
        { id: "2", name: "Vocals", isMuted: false, isSolo: false, volume: 0, pan: 0, clips: [] }
    ]);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [selectedTrackId, setSelectedTrackId] = useState<string>("2");
    const [isPlaying, setIsPlaying] = useState(false);
    const [bpm, setBpm] = useState(120);
    const [currentTime, setCurrentTime] = useState(0);
    const [isRecording, setIsRecording] = useState(false);

    // --- DRAG & DROP STATE (VISUAL ONLY - Prevents Render Loop Bug) ---
    const [dragState, setDragState] = useState<{
        type: 'MOVE' | 'RESIZE_L' | 'RESIZE_R';
        clipId: string;
        fromTrackId: string;
        startX: number;
        currentX: number;
        currentY: number;
        originalStart: number;
        originalDuration: number;
    } | null>(null);

    // --- UPLOAD STATE ---
    const [uploadForm, setUploadForm] = useState({ title: "", genre: "", bpm: "", price: "", description: "", tags: "" });
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [coverArt, setCoverArt] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // --- REFS ---
    const playersRef = useRef<Map<string, Tone.Player>>(new Map());
    const channelsRef = useRef<Map<string, Tone.Channel>>(new Map());
    const buffersRef = useRef<Map<string, Tone.ToneAudioBuffer>>(new Map()); // Store audio buffers for instant playback
    const recorderRef = useRef<Tone.Recorder | null>(null);
    const micRef = useRef<Tone.UserMedia | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const timelineRef = useRef<HTMLDivElement>(null);

    // --- 1. INITIALIZATION & AUTH ---
    useEffect(() => {
        const initEngine = async () => {
            micRef.current = new Tone.UserMedia();
            recorderRef.current = new Tone.Recorder();
            micRef.current.connect(recorderRef.current);
        };
        initEngine();

        // Check Auth
        const checkAuth = async () => {
            const token = localStorage.getItem('accessToken');
            if (!token) {
                navigate('/login');
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/api/auth/profile/`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!res.ok) {
                    navigate('/login');
                    return;
                }

                const profile = await res.json();
                if (!profile.is_creator) {
                    navigate('/');
                    return;
                }

                if (!id) {
                    setLoading(false);
                }
            } catch (error) {
                console.error("Auth check failed", error);
                navigate('/login');
            }
        };
        checkAuth();

        // Clean up
        return () => {
            micRef.current?.dispose();
            recorderRef.current?.dispose();
            playersRef.current.forEach(p => p.dispose());
            channelsRef.current.forEach(c => c.dispose());
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [navigate, API_BASE_URL, id]);

    // --- 2. LOAD PROJECT LOGIC ---
    useEffect(() => {
        if (!id) return;
        const loadProject = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/music/projects/${id}/`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setProjectId(data.id);
                    setProjectTitle(data.title);
                    setBpm(data.bpm);
                    if (data.arrangement_json?.tracks) {
                        const loadedTracks = data.arrangement_json.tracks.map((t: Track) => ({
                            ...t,
                            isSolo: t.isSolo ?? false,
                            volume: t.volume ?? 0,
                            pan: t.pan ?? 0
                        }));
                        setTracks(loadedTracks);

                        // Re-generate waveforms if missing
                        for (const track of loadedTracks) {
                            for (const clip of track.clips) {
                                if (!clip.waveformData && clip.url) {
                                    generateWaveform(clip.url, 100).then(wd => {
                                        setTracks(prev => prev.map(pt => ({
                                            ...pt,
                                            clips: pt.clips.map(pc => pc.id === clip.id ? { ...pc, waveformData: wd } : pc)
                                        })));
                                    });
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Load failed", err);
            } finally {
                setLoading(false);
            }
        };
        loadProject();
    }, [id, API_BASE_URL]);

    const fetchProjectList = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/music/projects/`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
            });
            if (res.ok) setSavedProjects(await res.json());
        } catch (e) { console.error(e); }
    };

    // --- 3. AUDIO ENGINE SYNC (Channels only - Players created on demand) ---
    useEffect(() => {
        Tone.Transport.bpm.value = bpm;

        tracks.forEach(track => {
            // Create/Update Channel (Volume/Pan)
            if (!channelsRef.current.has(track.id)) {
                const channel = new Tone.Channel({ volume: track.volume, pan: track.pan, mute: track.isMuted, solo: track.isSolo }).toDestination();
                channelsRef.current.set(track.id, channel);
            }
            const channel = channelsRef.current.get(track.id)!;
            channel.volume.rampTo(track.volume, 0.1);
            channel.pan.rampTo(track.pan, 0.1);
            channel.mute = track.isMuted;
            channel.solo = track.isSolo;

            // Pre-load players (use stored buffer if available for instant playback)
            track.clips.forEach(clip => {
                if (!playersRef.current.has(clip.id)) {
                    const buffer = buffersRef.current.get(clip.id);
                    
                    // Use buffer if available (CRITICAL for recordings)
                    const player = buffer 
                        ? new Tone.Player(buffer) 
                        : new Tone.Player(clip.url);
                    
                    player.connect(channel);
                    playersRef.current.set(clip.id, player);
                }
            });
        });

        // CLEANUP FUNCTION
        return () => {
            // Dispose all players to free memory
            playersRef.current.forEach(p => p.dispose());
            // CRITICAL FIX: Clear the map so they are recreated on next render
            playersRef.current.clear();
        };
    }, [tracks, bpm]);

    // --- 4. PLAYBACK CONTROLS ---
    const handlePlay = async () => {
        await Tone.start();

        if (isPlaying) {
            // Pause
            Tone.Transport.pause();
            playersRef.current.forEach(p => {
                try { p.stop(); } catch (e) { }
            });
            setIsPlaying(false);
        } else {
            // Stop any existing playback first
            Tone.Transport.stop();
            Tone.Transport.cancel();
            playersRef.current.forEach(p => {
                try {
                    p.stop();
                    p.unsync();
                } catch (e) { }
            });

            // Wait for all audio to load
            await Tone.loaded();

            // Schedule all clips on Transport
            tracks.forEach(track => {
                if (track.isMuted) return;

                const channel = channelsRef.current.get(track.id);

                track.clips.forEach(clip => {
                    let player = playersRef.current.get(clip.id);
                    
                    // Fallback: If player missing, recreate it correctly using BUFFER if available
                    if (!player) {
                        const buffer = buffersRef.current.get(clip.id);
                        player = buffer 
                            ? new Tone.Player(buffer).connect(channel!) 
                            : new Tone.Player(clip.url).connect(channel!);
                        playersRef.current.set(clip.id, player);
                    }

                    // Schedule playback
                    if (player.loaded) {
                        player.disconnect();
                        player.connect(channel!);
                        player.sync().start(clip.startTime, 0, clip.duration);
                    } else {
                        player.load(clip.url).then(() => {
                            player!.disconnect();
                            player!.connect(channel!);
                            player!.sync().start(clip.startTime, 0, clip.duration);
                        });
                    }
                });
            });

            // Start playback
            Tone.Transport.start();
            setIsPlaying(true);
            requestAnimationFrame(updatePlayhead);
        }
    };

    const handleStop = () => {
        Tone.Transport.stop();
        Tone.Transport.cancel();
        Tone.Transport.seconds = 0;
        playersRef.current.forEach(p => {
            try {
                p.stop();
                p.unsync();
            } catch (e) { }
        });
        setIsPlaying(false);
        setCurrentTime(0);
    };

    const updatePlayhead = () => {
        setCurrentTime(Tone.Transport.seconds);
        if (Tone.Transport.state === "started") {
            animationFrameRef.current = requestAnimationFrame(updatePlayhead);
        }
    };

    // --- 5. DRAG & DROP HANDLERS (VISUAL ONLY - Prevents 60fps re-renders) ---
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragState) return;
        setDragState(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
    };

    const handleMouseUp = () => {
        if (!dragState) return;

        // 1. Calculate Time Change
        const deltaPixels = dragState.currentX - dragState.startX;
        const deltaTime = deltaPixels / PX_PER_SEC;

        // 2. Identify Target Track (Vertical Drag)
        // Header is ~56px (h-14), each track is 128px (h-32)
        const headerHeight = 56;
        const trackHeight = 128;
        const relativeY = dragState.currentY - headerHeight;
        const trackIndex = Math.floor(relativeY / trackHeight);

        let targetTrackId = dragState.fromTrackId;
        if (trackIndex >= 0 && trackIndex < tracks.length) {
            targetTrackId = tracks[trackIndex].id;
        }

        const newTracks = tracks.map(track => {
            // Remove clip from old track if moving to different track
            if (track.id === dragState.fromTrackId && track.id !== targetTrackId) {
                return { ...track, clips: track.clips.filter(c => c.id !== dragState.clipId) };
            }

            // Add/Update clip in target track
            if (track.id === targetTrackId) {
                // If it's a move within the same track, find and update
                if (dragState.fromTrackId === targetTrackId) {
                    return {
                        ...track,
                        clips: track.clips.map(clip => {
                            if (clip.id !== dragState.clipId) return clip;
                            if (dragState.type === 'MOVE') {
                                const rawNewTime = dragState.originalStart + deltaTime;
                                return { ...clip, startTime: Math.max(0, Math.round(rawNewTime / SNAP_GRID) * SNAP_GRID) };
                            }
                            if (dragState.type === 'RESIZE_R') {
                                return { ...clip, duration: Math.max(0.1, dragState.originalDuration + deltaTime) };
                            }
                            return clip;
                        })
                    };
                }

                // If moving from a DIFFERENT track, find the clip and move it here
                const clipToMove = tracks.find(t => t.id === dragState.fromTrackId)?.clips.find(c => c.id === dragState.clipId);
                if (clipToMove) {
                    const rawNewTime = dragState.originalStart + deltaTime;
                    const movedClip = {
                        ...clipToMove,
                        startTime: Math.max(0, Math.round(rawNewTime / SNAP_GRID) * SNAP_GRID)
                    };
                    return { ...track, clips: [...track.clips, movedClip] };
                }
            }
            return track;
        });

        setTracks(newTracks);
        setDragState(null);
    };

    // Helper to render clips with visual drag position
    const getRenderStyle = (clip: Clip) => {
        let left = clip.startTime * PX_PER_SEC;
        let width = clip.duration * PX_PER_SEC;

        if (dragState && dragState.clipId === clip.id) {
            const deltaPixels = dragState.currentX - dragState.startX;
            if (dragState.type === 'MOVE') {
                left += deltaPixels;
            } else if (dragState.type === 'RESIZE_R') {
                width += deltaPixels;
            }
        }

        return { left: `${left}px`, width: `${Math.max(5, width)}px` };
    };

    // --- 6. RECORDING ---
    const handleRecord = async () => {
        if (isRecording) {
            const blob = await recorderRef.current?.stop();
            if (blob) {
                const url = URL.createObjectURL(blob);
                const buffer = await new Tone.ToneAudioBuffer().load(url);
                const waveData = await generateWaveform(url, 100);

                // Generate ID first so we can store buffer with matching ID
                const clipId = crypto.randomUUID();
                
                // Store buffer for instant playback (avoids blob URL loading issues)
                buffersRef.current.set(clipId, buffer);

                const newClip: Clip = {
                    id: clipId,
                    url,
                    name: "Rec " + (tracks.find(t => t.id === selectedTrackId)?.clips.length || 0 + 1),
                    startTime: Math.max(0, Tone.Transport.seconds - buffer.duration),
                    duration: buffer.duration,
                    waveformData: waveData,
                    color: "bg-red-500"
                };
                setTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, clips: [...t.clips, newClip] } : t));
            }
            setIsPlaying(false);
            setIsRecording(false);
            Tone.Transport.stop();
        } else {
            await Tone.start();
            await micRef.current?.open();
            recorderRef.current?.start();
            Tone.Transport.start();
            setIsPlaying(true);
            setIsRecording(true);
            requestAnimationFrame(updatePlayhead);
        }
    };

    // --- 7. IMPORT AUDIO ---
    const handleImportAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        const buffer = await new Tone.ToneAudioBuffer().load(url);
        const waveData = await generateWaveform(url, 100);

        // Generate ID first so we can store buffer with matching ID
        const clipId = crypto.randomUUID();
        
        // Store buffer for instant playback (avoids blob URL loading issues)
        buffersRef.current.set(clipId, buffer);

        const newClip: Clip = {
            id: clipId,
            url,
            startTime: 0,
            duration: buffer.duration,
            name: file.name,
            waveformData: waveData,
            color: "bg-blue-500"
        };

        setTracks(prev => prev.map(t =>
            t.id === selectedTrackId ? { ...t, clips: [...t.clips, newClip] } : t
        ));

        e.target.value = '';
    };

    // --- 8. SAVE PROJECT ---
    const saveProject = async () => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            alert("You must be logged in to save!");
            return;
        }

        setIsSaving(true);

        try {
            let savedProjectId = projectId;

            if (!savedProjectId) {
                const createRes = await fetch(`${API_BASE_URL}/api/music/projects/`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        title: projectTitle,
                        bpm: bpm,
                        arrangement_json: { tracks: [] }
                    })
                });

                if (createRes.ok) {
                    const newProject = await createRes.json();
                    savedProjectId = newProject.id;
                    setProjectId(savedProjectId);
                } else {
                    throw new Error("Failed to create project");
                }
            }

            // Upload blob files
            const updatedTracks = JSON.parse(JSON.stringify(tracks));
            for (const track of updatedTracks) {
                for (const clip of track.clips) {
                    if (clip.url.startsWith('blob:') && !clip.fileId) {
                        const blob = await fetch(clip.url).then(r => r.blob());
                        const formData = new FormData();
                        formData.append('file', blob, `${clip.name}.webm`);
                        formData.append('name', clip.name);
                        formData.append('duration', clip.duration.toString());

                        const uploadRes = await fetch(
                            `${API_BASE_URL}/api/music/projects/${savedProjectId}/upload/`,
                            {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${accessToken}` },
                                body: formData
                            }
                        );

                        if (uploadRes.ok) {
                            const fileData = await uploadRes.json();
                            clip.fileId = fileData.id;
                            clip.url = fileData.file_url;
                        }
                    }
                }
            }

            // Save arrangement
            await fetch(`${API_BASE_URL}/api/music/projects/${savedProjectId}/`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: projectTitle,
                    bpm: bpm,
                    arrangement_json: { tracks: updatedTracks }
                })
            });

            setTracks(updatedTracks);
            alert("Project saved successfully!");

            if (savedProjectId && !id) {
                navigate(`/studio/${savedProjectId}`, { replace: true });
            }
        } catch (error) {
            console.error("Failed to save project:", error);
            alert("Error saving project.");
        } finally {
            setIsSaving(false);
        }
    };

    // --- 9. CLEAR ALL ---
    const clearAll = () => {
        Tone.Transport.stop();
        setIsPlaying(false);
        setIsRecording(false);

        tracks.forEach(track => {
            track.clips.forEach(clip => {
                if (clip.url.startsWith('blob:')) {
                    URL.revokeObjectURL(clip.url);
                }
            });
        });

        playersRef.current.forEach(p => p.dispose());
        playersRef.current.clear();

        setTracks([
            { id: "1", name: "Beat", isMuted: false, isSolo: false, volume: -6, pan: 0, clips: [] },
            { id: "2", name: "Vocals", isMuted: false, isSolo: false, volume: 0, pan: 0, clips: [] }
        ]);
        setCurrentTime(0);
        setSelectedClipId(null);
    };

    // --- 10. DELETE KEY ---
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
                // Revoke blob URL
                for (const track of tracks) {
                    const clip = track.clips.find(c => c.id === selectedClipId);
                    if (clip && clip.url.startsWith('blob:')) {
                        URL.revokeObjectURL(clip.url);
                    }
                }

                // Dispose player
                const player = playersRef.current.get(selectedClipId);
                player?.dispose();
                playersRef.current.delete(selectedClipId);

                setTracks(prev => prev.map(t => ({ ...t, clips: t.clips.filter(c => c.id !== selectedClipId) })));
                setSelectedClipId(null);
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [selectedClipId, tracks]);

    // --- 11. UPLOAD HANDLER ---
    const handleUploadSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) return alert("Please log in first.");
        if (!audioFile) return alert("Please select an audio file.");

        setIsUploading(true);
        const formData = new FormData();

        formData.append('title', uploadForm.title);
        formData.append('genre', uploadForm.genre);
        if (uploadForm.bpm) formData.append('bpm', uploadForm.bpm);
        if (uploadForm.price) formData.append('price', uploadForm.price);
        formData.append('description', uploadForm.description);
        if (uploadForm.tags) formData.append('tags', uploadForm.tags);

        formData.append('audio_file', audioFile);
        if (coverArt) formData.append('cover_art', coverArt);

        try {
            const res = await fetch(`${API_BASE_URL}/api/music/tracks/`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: formData
            });

            if (res.ok) {
                alert("Track uploaded successfully!");
                setUploadForm({ title: "", genre: "", bpm: "", price: "", description: "", tags: "" });
                setAudioFile(null);
                setCoverArt(null);
                navigate('/');
            } else {
                const err = await res.json();
                console.error(err);
                alert("Upload failed. Check console for details.");
            }
        } catch (error) {
            console.error(error);
            alert("Network error.");
        } finally {
            setIsUploading(false);
        }
    };

    // Format time display
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#121214] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-purple-500 rounded-full animate-spin border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div
            className="flex flex-col h-screen bg-[#121214] text-white font-sans overflow-hidden select-none"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            {/* --- LOAD PROJECT MODAL --- */}
            {showLoadModal && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6">
                        <h3 className="text-xl font-bold mb-4">Open Project</h3>
                        <div className="max-h-60 overflow-y-auto space-y-2 mb-4">
                            {savedProjects.length === 0 && <p className="text-gray-500">No projects found.</p>}
                            {savedProjects.map(p => (
                                <div key={p.id} onClick={() => { navigate(`/studio/${p.id}`); setShowLoadModal(false); }}
                                    className="p-3 bg-gray-800 hover:bg-gray-700 rounded cursor-pointer flex justify-between items-center"
                                >
                                    <span>{p.title}</span>
                                    <span className="text-xs text-gray-500">{p.bpm} BPM</span>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setShowLoadModal(false)} className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded">Close</button>
                    </div>
                </div>
            )}

            {/* --- HEADER --- */}
            <div className="h-14 bg-[#18181b] border-b border-white/5 flex items-center justify-between px-4 z-20">
                <div className="flex items-center gap-4">
                    <Link to="/" className="opacity-80 hover:opacity-100"><Logo size="sm" showText={false} /></Link>

                    {/* View Switcher */}
                    <div className="flex bg-black/40 rounded-lg p-1">
                        <button onClick={() => setActiveTab('create')} className={`px-4 py-1 rounded text-xs font-bold ${activeTab === 'create' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>Studio</button>
                        <button onClick={() => setActiveTab('upload')} className={`px-4 py-1 rounded text-xs font-bold ${activeTab === 'upload' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Upload</button>
                    </div>

                    {/* File Menu */}
                    {activeTab === 'create' && (
                        <>
                            <div className="h-6 w-[1px] bg-white/10 mx-2"></div>
                            <button onClick={() => { fetchProjectList(); setShowLoadModal(true); }} className="text-xs text-gray-300 hover:text-white flex items-center gap-1">📂 Open</button>
                            <button onClick={saveProject} disabled={isSaving} className="text-xs text-gray-300 hover:text-white flex items-center gap-1">
                                {isSaving ? "..." : "💾 Save"}
                            </button>
                            <label className="text-xs text-gray-300 hover:text-white flex items-center gap-1 cursor-pointer">
                                📁 Import
                                <input type="file" accept="audio/*" onChange={handleImportAudio} className="hidden" />
                            </label>
                            <button onClick={clearAll} className="text-xs text-gray-300 hover:text-white">🗑 Clear</button>
                        </>
                    )}
                </div>

                {/* TRANSPORT BAR (Center) */}
                {activeTab === 'create' && (
                    <div className="flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
                        {/* Project Title */}
                        <input
                            type="text"
                            value={projectTitle}
                            onChange={(e) => setProjectTitle(e.target.value)}
                            className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-white/40 px-2 py-1 text-sm font-medium text-center w-40 focus:outline-none"
                            placeholder="Project Name"
                        />

                        {/* Main Controls */}
                        <div className="flex items-center gap-2">
                            <button onClick={handleStop} className="w-8 h-8 flex items-center justify-center bg-gray-800 rounded hover:bg-gray-700 transition" title="Stop">
                                <div className="w-3 h-3 bg-gray-400 rounded-sm"></div>
                            </button>
                            <button
                                onClick={handlePlay}
                                className={`w-10 h-10 flex items-center justify-center rounded-full transition shadow-lg ${isPlaying ? 'bg-green-500/20 text-green-500 ring-1 ring-green-500' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                title="Play/Pause"
                            >
                                {isPlaying ? (
                                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                                ) : (
                                    <svg className="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                )}
                            </button>
                            <button
                                onClick={handleRecord}
                                className={`w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 transition ${isRecording ? 'text-red-500 bg-red-500/10 ring-1 ring-red-500' : 'text-red-600'}`}
                                title="Record"
                            >
                                <div className={`w-3 h-3 rounded-full bg-current ${isRecording ? 'animate-pulse' : ''}`}></div>
                            </button>
                        </div>

                        {/* Display */}
                        <div className="bg-black/40 px-4 py-1.5 rounded-lg border border-white/5 flex items-center gap-4">
                            <div className="flex flex-col items-center leading-none">
                                <span className="text-[10px] text-gray-500 font-bold tracking-wider">BPM</span>
                                <input type="number" value={bpm} onChange={e => setBpm(Number(e.target.value))} className="w-10 bg-transparent text-center text-sm font-mono text-blue-400 focus:outline-none" min={40} max={300} />
                            </div>
                            <div className="w-[1px] h-6 bg-white/10"></div>
                            <div className="flex flex-col items-center leading-none w-20">
                                <span className="text-[10px] text-gray-500 font-bold tracking-wider">TIME</span>
                                <span className="text-sm font-mono text-green-400">{formatTime(currentTime)}</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="w-32"></div>
            </div>

            {/* --- WORKSPACE --- */}
            {activeTab === 'create' ? (
                <div className="flex-1 flex overflow-hidden">
                    {/* LEFT SIDEBAR (Tracks) */}
                    <div className="w-64 bg-[#18181b] border-r border-white/5 flex flex-col z-10 overflow-y-auto">
                        {tracks.map(track => (
                            <div
                                key={track.id}
                                onClick={() => setSelectedTrackId(track.id)}
                                className={`h-32 border-b border-white/5 p-3 flex flex-col justify-between transition-colors cursor-pointer ${selectedTrackId === track.id ? 'bg-white/5 border-l-2 border-l-purple-500' : 'hover:bg-white/5'}`}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <input
                                        value={track.name}
                                        onChange={e => setTracks(prev => prev.map(t => t.id === track.id ? { ...t, name: e.target.value } : t))}
                                        onClick={e => e.stopPropagation()}
                                        className="bg-transparent font-bold text-sm w-24 focus:outline-none focus:bg-black/50 rounded px-1"
                                    />
                                    <div className="flex gap-1">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setTracks(prev => prev.map(t => t.id === track.id ? { ...t, isMuted: !t.isMuted } : t)); }}
                                            className={`w-5 h-5 text-[10px] rounded flex items-center justify-center font-bold ${track.isMuted ? 'bg-red-500 text-white' : 'bg-[#27272a] text-gray-400 hover:bg-gray-600'}`}
                                        >M</button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setTracks(prev => prev.map(t => t.id === track.id ? { ...t, isSolo: !t.isSolo } : t)); }}
                                            className={`w-5 h-5 text-[10px] rounded flex items-center justify-center font-bold ${track.isSolo ? 'bg-yellow-500 text-black' : 'bg-[#27272a] text-gray-400 hover:bg-gray-600'}`}
                                        >S</button>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 group">
                                        <span className="text-[9px] text-gray-500 w-6">VOL</span>
                                        <input
                                            type="range" min="-60" max="25" value={track.volume}
                                            onClick={e => e.stopPropagation()}
                                            onChange={e => setTracks(prev => prev.map(t => t.id === track.id ? { ...t, volume: Number(e.target.value) } : t))}
                                            className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                                        />
                                        <span className="text-[9px] text-gray-400 w-8 text-right">{track.volume}dB</span>
                                    </div>
                                    <div className="flex items-center gap-2 group">
                                        <span className="text-[9px] text-gray-500 w-6">PAN</span>
                                        <input
                                            type="range" min="-1" max="1" step="0.1" value={track.pan}
                                            onClick={e => e.stopPropagation()}
                                            onChange={e => setTracks(prev => prev.map(t => t.id === track.id ? { ...t, pan: Number(e.target.value) } : t))}
                                            className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                                        />
                                        <span className="text-[9px] text-gray-400 w-8 text-right">
                                            {track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.abs(track.pan * 100).toFixed(0)}` : `R${(track.pan * 100).toFixed(0)}`}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button
                            onClick={() => setTracks([...tracks, { id: crypto.randomUUID(), name: `Track ${tracks.length + 1}`, isMuted: false, isSolo: false, volume: 0, pan: 0, clips: [] }])}
                            className="p-4 text-xs font-bold text-gray-500 hover:text-white hover:bg-white/5 border-b border-white/5 transition-colors"
                        >
                            + ADD TRACK
                        </button>
                    </div>

                    {/* RIGHT TIMELINE */}
                    <div className="flex-1 bg-[#121214] overflow-x-auto overflow-y-hidden relative" ref={timelineRef}>
                        {/* Time Ruler */}
                        <div className="h-8 bg-[#18181b] border-b border-white/5 sticky top-0 z-20 flex items-end pb-1 shadow-sm">
                            {Array.from({ length: 120 }).map((_, i) => (
                                <div key={i} className="flex-shrink-0 border-l border-white/10 text-[9px] text-gray-500 pl-1 select-none" style={{ width: `${PX_PER_SEC}px` }}>{i}s</div>
                            ))}
                        </div>

                        {/* Playhead */}
                        <div className="absolute top-0 bottom-0 w-[2px] bg-white z-30 pointer-events-none" style={{ left: `${currentTime * PX_PER_SEC}px` }}>
                            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-white -ml-[4px]"></div>
                        </div>

                        {/* Tracks Area */}
                        <div className="relative" style={{ minWidth: `${120 * PX_PER_SEC}px` }}>
                            {tracks.map(track => (
                                <div
                                    key={track.id}
                                    className={`h-32 border-b border-white/5 relative ${track.isMuted ? 'opacity-50' : ''} ${selectedTrackId === track.id ? 'bg-purple-900/10' : 'bg-gradient-to-b from-white/[0.02] to-transparent'}`}
                                >
                                    {/* Grid Lines */}
                                    <div className="absolute inset-0 pointer-events-none opacity-5" style={{ backgroundImage: `linear-gradient(to right, #fff 1px, transparent 1px)`, backgroundSize: `${PX_PER_SEC}px 100%` }} />

                                    {/* Clips */}
                                    {track.clips.map(clip => (
                                        <div
                                            key={clip.id}
                                            className={`absolute h-[80%] top-[10%] rounded overflow-hidden border-2 cursor-move group transition-shadow ${selectedClipId === clip.id
                                                ? 'ring-2 ring-white/50 border-white shadow-lg'
                                                : 'border-blue-500/50 hover:border-blue-400'
                                                } ${clip.color || 'bg-blue-600/20'}`}
                                            style={getRenderStyle(clip)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedClipId(clip.id);
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setSelectedClipId(clip.id);
                                                setDragState({
                                                    type: 'MOVE',
                                                    clipId: clip.id,
                                                    fromTrackId: track.id,
                                                    startX: e.clientX,
                                                    currentX: e.clientX,
                                                    currentY: e.clientY,
                                                    originalStart: clip.startTime,
                                                    originalDuration: clip.duration
                                                });
                                            }}
                                        >
                                            {/* Waveform */}
                                            <div className="w-full h-full flex items-center px-1 gap-[1px]">
                                                {(clip.waveformData || Array(40).fill(0.3)).map((v, i) => (
                                                    <div key={i} className="flex-1 bg-blue-200/40 rounded-full min-w-[1px]" style={{ height: `${Math.min(100, Math.max(10, v * 100))}%` }} />
                                                ))}
                                            </div>

                                            {/* Clip Name */}
                                            <span className="absolute top-1 left-2 text-[10px] font-bold text-white drop-shadow truncate max-w-[calc(100%-24px)]">{clip.name}</span>

                                            {/* Duration */}
                                            <span className="absolute bottom-1 right-2 text-[9px] text-white/60">{clip.duration.toFixed(1)}s</span>

                                            {/* Resize Handle */}
                                            <div
                                                className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    setDragState({
                                                        type: 'RESIZE_R',
                                                        clipId: clip.id,
                                                        fromTrackId: track.id,
                                                        startX: e.clientX,
                                                        currentX: e.clientX,
                                                        currentY: e.clientY,
                                                        originalStart: clip.startTime,
                                                        originalDuration: clip.duration
                                                    });
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                /* --- UPLOAD TAB --- */
                <div className="flex-1 bg-[#121214] overflow-y-auto p-8 flex justify-center">
                    <div className="w-full max-w-2xl bg-gray-900 border border-white/10 rounded-2xl p-8 shadow-2xl">
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                            📤 Upload Track
                            <span className="text-sm font-normal text-gray-400 bg-gray-800 px-2 py-1 rounded">MP3 / WAV</span>
                        </h2>

                        <form onSubmit={handleUploadSubmit} className="space-y-6">
                            {/* Audio File - Drag & Drop Zone */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Audio File *</label>
                                <div className="relative group">
                                    <input
                                        type="file"
                                        accept="audio/*"
                                        onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        required
                                    />
                                    <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${audioFile ? 'border-green-500 bg-green-500/10' : 'border-white/10 group-hover:border-blue-500 bg-white/5'}`}>
                                        {audioFile ? (
                                            <div className="text-green-400 font-medium">✅ Selected: {audioFile.name}</div>
                                        ) : (
                                            <div className="text-gray-400">
                                                <span className="text-2xl block mb-2">📂</span>
                                                <span className="font-medium text-white">Click to browse</span> or drag file here
                                                <p className="text-xs mt-1 text-gray-500">MP3 or WAV (Max 50MB)</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {audioFile && (
                                    <div className="mt-2 bg-gray-800 p-3 rounded-lg flex items-center gap-3">
                                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">🎵</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{audioFile.name}</p>
                                            <p className="text-xs text-gray-400">{(audioFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                        </div>
                                        <audio controls src={URL.createObjectURL(audioFile)} className="h-8 w-32" />
                                    </div>
                                )}
                            </div>

                            {/* Cover Art */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Cover Art</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setCoverArt(e.target.files?.[0] || null)}
                                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-white hover:file:bg-gray-600"
                                />
                                {coverArt && <p className="text-xs text-green-400">Selected: {coverArt.name}</p>}
                            </div>

                            {/* Metadata */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-300">Track Title *</label>
                                    <input
                                        type="text"
                                        value={uploadForm.title}
                                        onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                                        placeholder="e.g. Midnight Vibes"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-300">Genre</label>
                                    <select
                                        value={uploadForm.genre}
                                        onChange={(e) => setUploadForm({ ...uploadForm, genre: e.target.value })}
                                        className="w-full bg-gray-900 text-white border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="" className="bg-gray-900 text-white">Select Genre</option>
                                        <option value="Hip Hop" className="bg-gray-900 text-white">Hip Hop</option>
                                        <option value="Trap" className="bg-gray-900 text-white">Trap</option>
                                        <option value="R&B" className="bg-gray-900 text-white">R&B</option>
                                        <option value="Pop" className="bg-gray-900 text-white">Pop</option>
                                        <option value="Electronic" className="bg-gray-900 text-white">Electronic</option>
                                        <option value="Rock" className="bg-gray-900 text-white">Rock</option>
                                        <option value="Jazz" className="bg-gray-900 text-white">Jazz</option>
                                        <option value="Classical" className="bg-gray-900 text-white">Classical</option>
                                        <option value="Other" className="bg-gray-900 text-white">Other</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-300">BPM</label>
                                    <input
                                        type="number"
                                        value={uploadForm.bpm}
                                        onChange={(e) => setUploadForm({ ...uploadForm, bpm: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                                        placeholder="120"
                                        min={40} max={300}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-300">Price ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={uploadForm.price}
                                        onChange={(e) => setUploadForm({ ...uploadForm, price: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                                        placeholder="29.99"
                                        min={0}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Description</label>
                                <textarea
                                    value={uploadForm.description}
                                    onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500 h-24 resize-none"
                                    placeholder="Tell us about your track..."
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Tags (comma separated)</label>
                                <input
                                    type="text"
                                    value={uploadForm.tags}
                                    onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                                    placeholder="e.g. Dark, Melodic, 140BPM"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isUploading}
                                className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-[1.01] ${isUploading ? "bg-gray-600 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
                                    }`}
                            >
                                {isUploading ? "Uploading..." : "🚀 Publish to Market"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
