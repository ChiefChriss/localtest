import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as Tone from "tone";
import Logo from './components/Logo';

// CONSTANTS
const PX_PER_SEC = 50; // 1 second = 50 pixels wide

interface Clip {
    id: string;
    url: string;           // Blob URL or server URL of the recording
    fileId?: number;       // Server file ID (if saved)
    startTime: number;     // In Seconds (e.g., 2.5)
    duration: number;      // In Seconds
    name: string;
}

interface Track {
    id: string;
    name: string;
    isMuted: boolean;
    clips: Clip[];
}

// Drag state interface
interface DragState {
    clipId: string;
    trackId: string;
    startX: number;
    originalStartTime: number;
}

export default function Studio() {
    const navigate = useNavigate();
    const { id } = useParams(); // Get project ID from URL

    // STATE
    const [tracks, setTracks] = useState<Track[]>([
        { id: "1", name: "Beat (Imported)", isMuted: false, clips: [] },
        { id: "2", name: "Vocals", isMuted: false, clips: [] }
    ]);
    const [selectedTrackId, setSelectedTrackId] = useState<string>("2");
    const [isPlaying, setIsPlaying] = useState(false);
    const [bpm, setBpm] = useState(120);
    const [currentTime, setCurrentTime] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [projectTitle, setProjectTitle] = useState("Untitled Project");
    const [projectId, setProjectId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [recordStartTime, setRecordStartTime] = useState(0);
    const [dragState, setDragState] = useState<DragState | null>(null);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

    // REFS (Audio Engine)
    const playersRef = useRef<Map<string, Tone.Player>>(new Map());
    const recorderRef = useRef<Tone.Recorder | null>(null);
    const micRef = useRef<Tone.UserMedia | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Authentication check
    useEffect(() => {
        const checkAuth = async () => {
            const accessToken = localStorage.getItem('accessToken');
            if (!accessToken) {
                navigate('/login');
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/api/auth/profile/`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
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

                // Only set loading false if we're not loading a project
                if (!id) {
                    setLoading(false);
                }
            } catch (error) {
                console.error("Auth check failed", error);
                navigate('/login');
            }
        };

        checkAuth();
    }, [navigate, API_BASE_URL, id]);

    // LOAD PROJECT (if ID in URL)
    useEffect(() => {
        if (!id) return; // If no ID, starting a blank project

        const loadProject = async () => {
            const accessToken = localStorage.getItem('accessToken');
            if (!accessToken) return;

            try {
                setLoading(true);
                const res = await fetch(`${API_BASE_URL}/api/music/projects/${id}/`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });

                if (res.ok) {
                    const data = await res.json();

                    // 1. Set Meta Data
                    setProjectId(data.id);
                    setProjectTitle(data.title);
                    setBpm(data.bpm);

                    // 2. Load Tracks & Clips
                    if (data.arrangement_json && data.arrangement_json.tracks) {
                        const loadedTracks: Track[] = data.arrangement_json.tracks;
                        setTracks(loadedTracks);

                        // 3. Pre-load Audio into Tone.js
                        loadedTracks.forEach(track => {
                            track.clips.forEach(clip => {
                                if (clip.url && !playersRef.current.has(clip.id)) {
                                    const player = new Tone.Player(clip.url).toDestination();
                                    playersRef.current.set(clip.id, player);
                                }
                            });
                        });
                    }
                } else {
                    console.error("Failed to load project");
                    navigate('/studio'); // Redirect if not found
                }
            } catch (error) {
                console.error("Error loading project:", error);
                navigate('/studio');
            } finally {
                setLoading(false);
            }
        };

        loadProject();
    }, [id, navigate, API_BASE_URL]);

    // 1. INITIALIZE ENGINE
    useEffect(() => {
        micRef.current = new Tone.UserMedia();
        recorderRef.current = new Tone.Recorder();
        micRef.current.connect(recorderRef.current);

        return () => {
            micRef.current?.dispose();
            recorderRef.current?.dispose();
            playersRef.current.forEach(p => p.dispose());
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    // 2. BPM SYNC
    useEffect(() => {
        Tone.Transport.bpm.value = bpm;
    }, [bpm]);

    // Playhead update loop
    const updatePlayhead = useCallback(() => {
        if (Tone.Transport.state === "started") {
            setCurrentTime(Tone.Transport.seconds);
            animationFrameRef.current = requestAnimationFrame(updatePlayhead);
        }
    }, []);

    // Helper: Stop all playing audio
    const stopAllPlayers = () => {
        playersRef.current.forEach(player => {
            if (player.state === "started") {
                player.stop();
            }
        });
    };

    // 3. PLAYBACK LOGIC
    const handlePlay = async () => {
        await Tone.start();

        if (isPlaying) {
            // STOP: Cancel transport and stop all players
            Tone.Transport.stop();
            Tone.Transport.cancel();
            stopAllPlayers(); // Stop all audio that's currently playing
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            setIsPlaying(false);
            setCurrentTime(0);
            Tone.Transport.seconds = 0;
        } else {
            // PLAY: Schedule all clips
            Tone.Transport.cancel();
            stopAllPlayers(); // Ensure nothing is playing before we start

            tracks.forEach(track => {
                if (track.isMuted) return;

                track.clips.forEach(clip => {
                    // Create a player if it doesn't exist
                    if (!playersRef.current.has(clip.id)) {
                        const player = new Tone.Player(clip.url).toDestination();
                        playersRef.current.set(clip.id, player);
                    }

                    const player = playersRef.current.get(clip.id);
                    if (player && player.loaded) {
                        Tone.Transport.schedule((time) => {
                            player.start(time);
                        }, clip.startTime);
                    }
                });
            });

            Tone.Transport.start();
            setIsPlaying(true);
            animationFrameRef.current = requestAnimationFrame(updatePlayhead);
        }
    };

    // 4. RECORDING LOGIC
    const handleRecord = async () => {
        if (isRecording) {
            // STOP RECORDING
            const blob = await recorderRef.current?.stop();
            if (blob) {
                const url = URL.createObjectURL(blob);

                // Calculate duration using Tone.js
                const buffer = await new Tone.ToneAudioBuffer().load(url);
                const duration = buffer.duration;

                // Add the new Clip to the selected track
                const newClip: Clip = {
                    id: crypto.randomUUID(),
                    url,
                    startTime: recordStartTime,
                    duration: duration,
                    name: `Recording ${new Date().toLocaleTimeString()}`
                };

                setTracks(prev => prev.map(t =>
                    t.id === selectedTrackId
                        ? { ...t, clips: [...t.clips, newClip] }
                        : t
                ));
            }
            // Stop everything
            Tone.Transport.stop();
            Tone.Transport.cancel();
            stopAllPlayers(); // Stop all audio
            setIsPlaying(false);
            setIsRecording(false);
            setCurrentTime(0);
            Tone.Transport.seconds = 0;
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }

        } else {
            // START RECORDING
            await Tone.start();
            await micRef.current?.open();
            stopAllPlayers(); // Ensure nothing is playing
            setRecordStartTime(Tone.Transport.seconds);
            recorderRef.current?.start();
            Tone.Transport.start();
            setIsPlaying(true);
            setIsRecording(true);
            animationFrameRef.current = requestAnimationFrame(updatePlayhead);
        }
    };

    // 5. ADD TRACK
    const addTrack = () => {
        const newTrack: Track = {
            id: crypto.randomUUID(),
            name: `Track ${tracks.length + 1}`,
            isMuted: false,
            clips: []
        };
        setTracks([...tracks, newTrack]);
    };

    // 6. TOGGLE MUTE
    const toggleMute = (trackId: string) => {
        setTracks(tracks.map(t =>
            t.id === trackId ? { ...t, isMuted: !t.isMuted } : t
        ));
    };

    // 7. DELETE CLIP
    const deleteClip = (trackId: string, clipId: string) => {
        setTracks(tracks.map(t =>
            t.id === trackId
                ? { ...t, clips: t.clips.filter(c => c.id !== clipId) }
                : t
        ));
        // Cleanup player
        const player = playersRef.current.get(clipId);
        if (player) {
            player.dispose();
            playersRef.current.delete(clipId);
        }
    };

    // 8. CLEAR ALL
    const clearAll = () => {
        // Stop everything first
        Tone.Transport.stop();
        Tone.Transport.cancel();
        stopAllPlayers();
        setIsPlaying(false);
        setIsRecording(false);
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        
        // Reset tracks
        setTracks([
            { id: "1", name: "Beat (Imported)", isMuted: false, clips: [] },
            { id: "2", name: "Vocals", isMuted: false, clips: [] }
        ]);
        
        // Dispose all players
        playersRef.current.forEach(p => p.dispose());
        playersRef.current.clear();
        setCurrentTime(0);
        Tone.Transport.seconds = 0;
    };

    // 9. SAVE PROJECT
    const saveProject = async () => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            alert("You must be logged in to save!");
            return;
        }

        setIsSaving(true);

        try {
            // First, create or update the project
            const projectPayload = {
                title: projectTitle,
                bpm: bpm,
                arrangement_json: { tracks }
            };

            let savedProjectId = projectId;

            if (projectId) {
                // Update existing project
                await fetch(`${API_BASE_URL}/api/music/projects/${projectId}/`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(projectPayload)
                });
            } else {
                // Create new project
                const res = await fetch(`${API_BASE_URL}/api/music/projects/`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(projectPayload)
                });

                if (res.ok) {
                    const data = await res.json();
                    savedProjectId = data.id;
                    setProjectId(data.id);
                }
            }

            // Upload any blob URLs as files
            if (savedProjectId) {
                for (const track of tracks) {
                    for (const clip of track.clips) {
                        // Check if this is a blob URL (local recording not yet uploaded)
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
                                // Update clip with server URL
                                clip.fileId = fileData.id;
                                clip.url = fileData.file_url;
                            }
                        }
                    }
                }

                // Save the updated arrangement with file URLs
                await fetch(`${API_BASE_URL}/api/music/projects/${savedProjectId}/`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        title: projectTitle,
                        bpm: bpm,
                        arrangement_json: { tracks }
                    })
                });
            }

            alert("Project saved successfully!");
        } catch (error) {
            console.error("Failed to save project:", error);
            alert("Error saving project.");
        } finally {
            setIsSaving(false);
        }
    };

    // 10. IMPORT AUDIO FILE
    const handleImportAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        const buffer = await new Tone.ToneAudioBuffer().load(url);

        const newClip: Clip = {
            id: crypto.randomUUID(),
            url,
            startTime: 0,
            duration: buffer.duration,
            name: file.name
        };

        setTracks(prev => prev.map(t =>
            t.id === selectedTrackId
                ? { ...t, clips: [...t.clips, newClip] }
                : t
        ));

        // Reset input
        e.target.value = '';
    };

    // Format time display
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    // 11. DRAG & DROP CLIP REPOSITIONING
    const handleClipMouseDown = (e: React.MouseEvent, trackId: string, clip: Clip) => {
        e.preventDefault();
        e.stopPropagation();
        setDragState({
            clipId: clip.id,
            trackId: trackId,
            startX: e.clientX,
            originalStartTime: clip.startTime
        });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragState) return;

        const deltaX = e.clientX - dragState.startX;
        const deltaTime = deltaX / PX_PER_SEC;
        const newStartTime = Math.max(0, dragState.originalStartTime + deltaTime);

        setTracks(prev => prev.map(track =>
            track.id === dragState.trackId
                ? {
                    ...track,
                    clips: track.clips.map(clip =>
                        clip.id === dragState.clipId
                            ? { ...clip, startTime: newStartTime }
                            : clip
                    )
                }
                : track
        ));
    }, [dragState]);

    const handleMouseUp = useCallback(() => {
        setDragState(null);
    }, []);

    // Global mouse event listeners for drag
    useEffect(() => {
        if (dragState) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [dragState, handleMouseMove, handleMouseUp]);

    // 12. SAVE AND REDIRECT (update URL after creating new project)
    const saveProjectAndRedirect = async () => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            alert("You must be logged in to save!");
            return;
        }

        setIsSaving(true);

        try {
            const projectPayload = {
                title: projectTitle,
                bpm: bpm,
                arrangement_json: { tracks }
            };

            let savedProjectId = projectId;

            if (projectId) {
                // Update existing project
                await fetch(`${API_BASE_URL}/api/music/projects/${projectId}/`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(projectPayload)
                });
            } else {
                // Create new project
                const res = await fetch(`${API_BASE_URL}/api/music/projects/`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(projectPayload)
                });

                if (res.ok) {
                    const data = await res.json();
                    savedProjectId = data.id;
                    setProjectId(data.id);
                }
            }

            // Upload any blob URLs as files
            if (savedProjectId) {
                const updatedTracks = [...tracks];
                
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

                // Save the updated arrangement with file URLs
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
            }

            alert("Project saved successfully!");

            // Redirect to /studio/:id if this was a new project
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

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-purple-500 rounded-full animate-spin border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="flex bg-black text-white min-h-screen">
            {/* Sidebar */}
            <div className="w-16 lg:w-56 border-r border-white/10 flex flex-col bg-black/50 backdrop-blur-xl h-screen fixed left-0 top-0 z-20">
                <div className="p-4 border-b border-white/5">
                    <Link to="/">
                        <Logo size="md" showText={false} className="lg:hidden" />
                        <Logo size="md" showText={true} className="hidden lg:flex" />
                    </Link>
                </div>
                <nav className="flex-1 p-2 space-y-1">
                    <Link to="/" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        <span className="hidden lg:block">Home</span>
                    </Link>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-600/20 text-purple-300 font-medium">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        <span className="hidden lg:block">Studio</span>
                    </div>
                </nav>
            </div>

            {/* Main Content */}
            <div className="flex-1 ml-16 lg:ml-56 flex flex-col h-screen">
                {/* Top Toolbar */}
                <div className="bg-gray-900/80 border-b border-white/10 p-4 flex items-center gap-4 flex-wrap">
                    {/* Project Title */}
                    <input
                        type="text"
                        value={projectTitle}
                        onChange={(e) => setProjectTitle(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white w-48 focus:outline-none focus:border-purple-500"
                        placeholder="Project Name"
                    />

                    {/* Transport Controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePlay}
                            className={`px-6 py-2 rounded-lg font-bold transition-all ${isPlaying
                                ? "bg-red-500 hover:bg-red-600"
                                : "bg-green-500 hover:bg-green-600"
                                }`}
                        >
                            {isPlaying ? "⏹ STOP" : "▶ PLAY"}
                        </button>

                        <button
                            onClick={handleRecord}
                            className={`px-6 py-2 rounded-lg font-bold transition-all ${isRecording
                                ? "bg-red-600 animate-pulse"
                                : "bg-red-500 hover:bg-red-600"
                                }`}
                        >
                            {isRecording ? "⏹ STOP REC" : "⏺ RECORD"}
                        </button>
                    </div>

                    {/* BPM Control */}
                    <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                        <span className="text-gray-400 text-sm">BPM</span>
                        <input
                            type="number"
                            value={bpm}
                            onChange={(e) => setBpm(Number(e.target.value))}
                            className="w-16 bg-transparent text-center text-white font-mono focus:outline-none"
                            min={60}
                            max={240}
                        />
                    </div>

                    {/* Time Display */}
                    <div className="bg-white/5 rounded-lg px-4 py-2 font-mono text-lg">
                        {formatTime(currentTime)}
                    </div>

                    {/* Import Button */}
                    <label className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium cursor-pointer transition-colors">
                        📁 Import
                        <input
                            type="file"
                            accept="audio/*"
                            onChange={handleImportAudio}
                            className="hidden"
                        />
                    </label>

                    {/* Save Button */}
                    <button
                        onClick={saveProjectAndRedirect}
                        disabled={isSaving}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                        {isSaving ? "Saving..." : "💾 Save"}
                    </button>

                    {/* Clear Button */}
                    <button
                        onClick={clearAll}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                    >
                        🗑 Clear
                    </button>
                </div>

                {/* Timeline Area */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Track Headers (Left Panel) */}
                    <div className="w-48 bg-gray-900 border-r border-white/10 flex-shrink-0 overflow-y-auto">
                        {tracks.map(track => (
                            <div
                                key={track.id}
                                onClick={() => setSelectedTrackId(track.id)}
                                className={`h-24 p-3 border-b border-white/10 cursor-pointer transition-colors ${selectedTrackId === track.id
                                    ? "bg-purple-900/30 border-l-4 border-l-purple-500"
                                    : "hover:bg-white/5"
                                    }`}
                            >
                                <div className="font-medium text-sm truncate">{track.name}</div>
                                <div className="flex items-center gap-2 mt-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleMute(track.id);
                                        }}
                                        className={`text-xs px-2 py-1 rounded ${track.isMuted
                                            ? "bg-red-500 text-white"
                                            : "bg-white/10 text-gray-400 hover:bg-white/20"
                                            }`}
                                    >
                                        {track.isMuted ? "M" : "M"}
                                    </button>
                                    <span className={`text-xs ${track.isMuted ? "text-red-400" : "text-gray-500"}`}>
                                        {track.isMuted ? "Muted" : "Active"}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {track.clips.length} clip{track.clips.length !== 1 ? 's' : ''}
                                </div>
                            </div>
                        ))}

                        {/* Add Track Button */}
                        <button
                            onClick={addTrack}
                            className="w-full py-3 text-sm text-gray-500 hover:text-white hover:bg-white/5 transition-colors border-b border-white/10"
                        >
                            + Add Track
                        </button>
                    </div>

                    {/* Timeline (Right Panel - Scrollable) */}
                    <div className="flex-1 bg-gray-950 overflow-x-auto overflow-y-auto relative">
                        {/* Time Ruler */}
                        <div className="h-8 bg-gray-900 border-b border-white/10 sticky top-0 z-10 flex">
                            {Array.from({ length: 60 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="flex-shrink-0 border-l border-white/10 text-xs text-gray-500 pl-1"
                                    style={{ width: `${PX_PER_SEC}px` }}
                                >
                                    {i}s
                                </div>
                            ))}
                        </div>

                        {/* Playhead */}
                        <div
                            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-40 pointer-events-none"
                            style={{ left: `${currentTime * PX_PER_SEC}px` }}
                        />

                        {/* Track Lanes */}
                        {tracks.map(track => (
                            <div
                                key={track.id}
                                className={`h-24 border-b border-white/5 relative ${track.isMuted ? 'opacity-50' : ''
                                    } ${selectedTrackId === track.id ? 'bg-purple-900/10' : ''}`}
                                style={{ minWidth: `${60 * PX_PER_SEC}px` }}
                            >
                                {/* Grid Lines */}
                                <div className="absolute inset-0 flex pointer-events-none">
                                    {Array.from({ length: 60 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="flex-shrink-0 border-l border-white/5"
                                            style={{ width: `${PX_PER_SEC}px` }}
                                        />
                                    ))}
                                </div>

                                {/* Clips */}
                                {track.clips.map(clip => (
                                    <div
                                        key={clip.id}
                                        onMouseDown={(e) => handleClipMouseDown(e, track.id, clip)}
                                        className={`absolute h-20 top-2 rounded-lg overflow-hidden border group select-none ${
                                            dragState?.clipId === clip.id 
                                                ? 'border-yellow-400 shadow-lg shadow-yellow-500/30 cursor-grabbing z-50' 
                                                : 'border-blue-400/50 cursor-grab'
                                        }`}
                                        style={{
                                            left: `${clip.startTime * PX_PER_SEC}px`,
                                            width: `${clip.duration * PX_PER_SEC}px`,
                                            background: dragState?.clipId === clip.id
                                                ? 'linear-gradient(180deg, rgba(234, 179, 8, 0.8) 0%, rgba(234, 179, 8, 0.4) 100%)'
                                                : 'linear-gradient(180deg, rgba(59, 130, 246, 0.8) 0%, rgba(59, 130, 246, 0.4) 100%)'
                                        }}
                                    >
                                        {/* Clip Header */}
                                        <div className={`px-2 py-1 text-xs font-medium truncate flex justify-between items-center ${
                                            dragState?.clipId === clip.id ? 'bg-yellow-600/80' : 'bg-blue-600/80'
                                        }`}>
                                            <span>{clip.name}</span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteClip(track.id, clip.id);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 text-white/70 hover:text-white transition-opacity"
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        {/* Waveform Placeholder */}
                                        <div className="h-full flex items-center justify-center pointer-events-none">
                                            <div className="flex items-end gap-0.5 h-8">
                                                {Array.from({ length: Math.min(Math.floor(clip.duration * 10), 50) }).map((_, i) => (
                                                    <div
                                                        key={i}
                                                        className="w-1 bg-white/40 rounded-full"
                                                        style={{ height: `${Math.random() * 100}%` }}
                                                    />
                                                ))}
                                            </div>
                                        </div>

                                        {/* Time Position Label */}
                                        <div className="absolute bottom-1 left-2 text-xs text-white/60">
                                            {clip.startTime.toFixed(1)}s
                                        </div>

                                        {/* Duration Label */}
                                        <div className="absolute bottom-1 right-2 text-xs text-white/60">
                                            {clip.duration.toFixed(1)}s
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom Status Bar */}
                <div className="bg-gray-900 border-t border-white/10 px-4 py-2 flex items-center justify-between text-sm text-gray-500">
                    <div>
                        Selected: {tracks.find(t => t.id === selectedTrackId)?.name || 'None'}
                    </div>
                    <div className="flex items-center gap-4">
                        <span>{tracks.length} tracks</span>
                        <span>{tracks.reduce((acc, t) => acc + t.clips.length, 0)} clips</span>
                        <span>Zoom: {PX_PER_SEC}px/sec</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
