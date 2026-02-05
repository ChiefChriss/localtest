import { useState, useEffect, useRef, useCallback } from "react";
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

export default function Studio() {
    const navigate = useNavigate();
    const { id } = useParams();
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

    // --- GLOBAL LAYOUT STATE ---
    const [activeTab, setActiveTab] = useState<'create' | 'upload'>('create');
    const [loading, setLoading] = useState(true);
    const [projectTitle, setProjectTitle] = useState("Untitled Project");
    const [projectId, setProjectId] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);

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
    
    // --- DRAG & DROP STATE ---
    const [dragState, setDragState] = useState<{
        type: 'MOVE' | 'RESIZE_L' | 'RESIZE_R';
        clipId: string;
        trackId: string;
        startX: number;
        originalStart: number;
        originalDuration: number;
    } | null>(null);

    // --- UPLOAD TAB STATE ---
    const [uploadForm, setUploadForm] = useState({
        title: "", genre: "", bpm: "", price: "", description: "", tags: ""
    });
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [coverArt, setCoverArt] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // --- REFS ---
    const playersRef = useRef<Map<string, Tone.Player>>(new Map());
    const channelsRef = useRef<Map<string, Tone.Channel>>(new Map());
    const recorderRef = useRef<Tone.Recorder | null>(null);
    const micRef = useRef<Tone.UserMedia | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const timelineRef = useRef<HTMLDivElement>(null);

    // --- AUTHENTICATION CHECK ---
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

    // --- LOAD EXISTING PROJECT ---
    useEffect(() => {
        const loadProject = async () => {
            if (!id) return;

            const accessToken = localStorage.getItem('accessToken');
            if (!accessToken) return;

            try {
                const res = await fetch(`${API_BASE_URL}/api/music/projects/${id}/`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });

                if (res.ok) {
                    const project = await res.json();
                    setProjectId(project.id);
                    setProjectTitle(project.title || "Untitled Project");
                    setBpm(project.bpm || 120);

                    if (project.arrangement_json?.tracks) {
                        const loadedTracks = project.arrangement_json.tracks.map((t: Track) => ({
                            ...t,
                            isSolo: t.isSolo ?? false,
                            volume: t.volume ?? 0,
                            pan: t.pan ?? 0
                        }));
                        setTracks(loadedTracks);
                        
                        // Generate waveforms for loaded clips
                        for (const track of loadedTracks) {
                            for (const clip of track.clips) {
                                if (!clip.waveformData && clip.url) {
                                    generateWaveform(clip.url, 100).then(waveData => {
                                        setTracks(prev => prev.map(t => ({
                                            ...t,
                                            clips: t.clips.map(c => 
                                                c.id === clip.id ? { ...c, waveformData: waveData } : c
                                            )
                                        })));
                                    });
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to load project:", error);
            } finally {
                setLoading(false);
            }
        };

        loadProject();
    }, [id, API_BASE_URL]);

    // --- INITIALIZATION ---
    useEffect(() => {
        micRef.current = new Tone.UserMedia();
        recorderRef.current = new Tone.Recorder();
        micRef.current.connect(recorderRef.current);

        return () => {
            micRef.current?.dispose();
            recorderRef.current?.dispose();
            playersRef.current.forEach(p => p.dispose());
            channelsRef.current.forEach(c => c.dispose());
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, []);

    // --- AUDIO SYNC & PLAYBACK ---
    useEffect(() => {
        Tone.Transport.bpm.value = bpm;

        tracks.forEach(track => {
            // Create Channel (Mixer Strip)
            if (!channelsRef.current.has(track.id)) {
                const channel = new Tone.Channel({
                    volume: track.volume,
                    pan: track.pan,
                    mute: track.isMuted,
                    solo: track.isSolo
                }).toDestination();
                channelsRef.current.set(track.id, channel);
            }
            
            // Update Channel Settings
            const channel = channelsRef.current.get(track.id);
            if (channel) {
                channel.volume.rampTo(track.volume, 0.1);
                channel.pan.rampTo(track.pan, 0.1);
                channel.mute = track.isMuted;
                channel.solo = track.isSolo;
            }

            // Sync Clips (Players)
            track.clips.forEach(clip => {
                if (!playersRef.current.has(clip.id)) {
                    const player = new Tone.Player(clip.url);
                    player.connect(channel!);
                    player.sync().start(clip.startTime).stop(clip.startTime + clip.duration);
                    playersRef.current.set(clip.id, player);
                } else {
                    const player = playersRef.current.get(clip.id);
                    if (player) {
                        if (player.state === 'started') player.stop();
                        player.unsync();
                        player.sync().start(clip.startTime).stop(clip.startTime + clip.duration);
                    }
                }
            });
        });
    }, [tracks, bpm]);

    const handlePlay = async () => {
        await Tone.start();
        if (isPlaying) {
            Tone.Transport.pause();
            setIsPlaying(false);
        } else {
            Tone.Transport.start();
            setIsPlaying(true);
            updatePlayhead();
        }
    };

    const handleStop = () => {
        Tone.Transport.stop();
        setIsPlaying(false);
        setCurrentTime(0);
    };

    const updatePlayhead = () => {
        setCurrentTime(Tone.Transport.seconds);
        if (Tone.Transport.state === "started") {
            animationFrameRef.current = requestAnimationFrame(updatePlayhead);
        }
    };

    // --- DRAG, RESIZE LOGIC ---
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragState) return;
        
        const deltaPixels = e.clientX - dragState.startX;
        const deltaTime = deltaPixels / PX_PER_SEC;

        setTracks(prev => prev.map(track => {
            if (track.id !== dragState.trackId) return track;
            
            return {
                ...track,
                clips: track.clips.map(clip => {
                    if (clip.id !== dragState.clipId) return clip;

                    if (dragState.type === 'MOVE') {
                        const rawNewTime = dragState.originalStart + deltaTime;
                        const newTime = Math.max(0, Math.round(rawNewTime / SNAP_GRID) * SNAP_GRID);
                        return { ...clip, startTime: newTime };
                    }
                    if (dragState.type === 'RESIZE_R') {
                        const rawNewDur = dragState.originalDuration + deltaTime;
                        return { ...clip, duration: Math.max(0.1, rawNewDur) };
                    }
                    return clip;
                })
            };
        }));
    };

    const handleMouseUp = () => {
        setDragState(null);
    };

    // --- DELETE LOGIC ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedClipId) {
                // Revoke blob URL to free memory
                for (const track of tracks) {
                    const clip = track.clips.find(c => c.id === selectedClipId);
                    if (clip && clip.url.startsWith('blob:')) {
                        URL.revokeObjectURL(clip.url);
                    }
                }
                
                // Dispose player
                const player = playersRef.current.get(selectedClipId);
                if (player) {
                    player.dispose();
                    playersRef.current.delete(selectedClipId);
                }

                setTracks(prev => prev.map(t => ({
                    ...t,
                    clips: t.clips.filter(c => c.id !== selectedClipId)
                })));
                setSelectedClipId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedClipId, tracks]);

    // --- RECORDING LOGIC ---
    const handleRecord = async () => {
        if (isRecording) {
            const blob = await recorderRef.current?.stop();
            if (blob) {
                const url = URL.createObjectURL(blob);
                const buffer = await new Tone.ToneAudioBuffer().load(url);
                const waveData = await generateWaveform(url, 100);
                
                const newClip: Clip = {
                    id: crypto.randomUUID(),
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
            updatePlayhead();
        }
    };

    // --- IMPORT AUDIO ---
    const handleImportAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        const buffer = await new Tone.ToneAudioBuffer().load(url);
        const waveData = await generateWaveform(url, 100);

        const newClip: Clip = {
            id: crypto.randomUUID(),
            url,
            startTime: 0,
            duration: buffer.duration,
            name: file.name,
            waveformData: waveData,
            color: "bg-blue-500"
        };

        setTracks(prev => prev.map(t =>
            t.id === selectedTrackId
                ? { ...t, clips: [...t.clips, newClip] }
                : t
        ));

        e.target.value = '';
    };

    // --- CLEAR ALL ---
    const clearAll = () => {
        Tone.Transport.stop();
        setIsPlaying(false);
        setIsRecording(false);
        
        // Revoke blob URLs
        tracks.forEach(track => {
            track.clips.forEach(clip => {
                if (clip.url.startsWith('blob:')) {
                    URL.revokeObjectURL(clip.url);
                }
            });
        });
        
        // Dispose players
        playersRef.current.forEach(p => p.dispose());
        playersRef.current.clear();
        
        setTracks([
            { id: "1", name: "Beat", isMuted: false, isSolo: false, volume: -6, pan: 0, clips: [] },
            { id: "2", name: "Vocals", isMuted: false, isSolo: false, volume: 0, pan: 0, clips: [] }
        ]);
        setCurrentTime(0);
        setSelectedClipId(null);
    };

    // --- SAVE PROJECT ---
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

    // --- UPLOAD HANDLER ---
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
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-purple-500 rounded-full animate-spin border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div 
            className="flex flex-col h-screen bg-gray-950 text-white font-sans overflow-hidden"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            {/* --- HEADER / TAB SWITCHER --- */}
            <div className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 z-20">
                <div className="flex items-center gap-4">
                    <Link to="/"><Logo size="sm" showText={false} /></Link>
                    <div className="flex bg-black/30 rounded-lg p-1">
                        <button 
                            onClick={() => setActiveTab('create')}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'create' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            🎹 Studio
                        </button>
                        <button 
                            onClick={() => setActiveTab('upload')}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'upload' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            ☁️ Upload
                        </button>
                    </div>
                </div>

                {/* TRANSPORT CONTROLS (Only visible in Create) */}
                {activeTab === 'create' && (
                    <div className="flex items-center gap-4">
                        {/* Project Title */}
                        <input
                            type="text"
                            value={projectTitle}
                            onChange={(e) => setProjectTitle(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white w-40 text-sm focus:outline-none focus:border-purple-500"
                            placeholder="Project Name"
                        />

                        <div className="flex items-center bg-gray-800 rounded-lg p-1">
                            <button onClick={handleStop} className="w-10 h-8 flex items-center justify-center hover:bg-gray-700 rounded" title="Stop">⏹</button>
                            <button onClick={handlePlay} className={`w-12 h-8 flex items-center justify-center rounded font-bold ${isPlaying ? 'bg-green-500/20 text-green-500' : 'hover:bg-gray-700'}`} title="Play/Pause">
                                {isPlaying ? '⏸' : '▶'}
                            </button>
                            <button onClick={handleRecord} className={`w-10 h-8 flex items-center justify-center rounded ${isRecording ? 'text-red-500 animate-pulse' : 'hover:bg-gray-700 text-red-500'}`} title="Record">●</button>
                        </div>

                        <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
                            <span className="text-xs text-gray-400">BPM</span>
                            <input type="number" value={bpm} onChange={e => setBpm(Number(e.target.value))} className="w-12 bg-transparent text-center font-mono outline-none" min={40} max={300} />
                        </div>

                        <div className="font-mono text-lg w-28 text-center bg-gray-800 px-3 py-1.5 rounded-lg">
                            {formatTime(currentTime)}
                        </div>

                        {/* Import */}
                        <label className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium cursor-pointer transition-colors">
                            📁 Import
                            <input type="file" accept="audio/*" onChange={handleImportAudio} className="hidden" />
                        </label>

                        {/* Save */}
                        <button onClick={saveProject} disabled={isSaving} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                            {isSaving ? "..." : "💾 Save"}
                        </button>

                        {/* Clear */}
                        <button onClick={clearAll} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-400 hover:text-white transition-colors">
                            🗑
                        </button>
                    </div>
                )}
                
                <div className="w-20"></div>
            </div>

            {/* --- MAIN WORKSPACE --- */}
            {activeTab === 'create' ? (
                <div className="flex-1 flex overflow-hidden">
                    {/* TRACK HEADERS (Left) */}
                    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-10 overflow-y-auto">
                        {tracks.map(track => (
                            <div 
                                key={track.id} 
                                onClick={() => setSelectedTrackId(track.id)}
                                className={`h-28 border-b border-gray-800 p-3 flex flex-col justify-between cursor-pointer transition-colors ${
                                    selectedTrackId === track.id ? 'bg-purple-900/30 border-l-4 border-l-purple-500' : 'bg-gray-800/50 hover:bg-gray-800'
                                }`}
                            >
                                <div className="flex justify-between items-start">
                                    <input 
                                        value={track.name} 
                                        onChange={e => setTracks(prev => prev.map(t => t.id === track.id ? { ...t, name: e.target.value } : t))}
                                        onClick={e => e.stopPropagation()}
                                        className="bg-transparent font-bold w-24 focus:outline-none" 
                                    />
                                    <div className="flex gap-1">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setTracks(prev => prev.map(t => t.id === track.id ? {...t, isMuted: !t.isMuted} : t)); }} 
                                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${track.isMuted ? 'bg-red-500' : 'bg-gray-700 hover:bg-gray-600'}`}
                                        >M</button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setTracks(prev => prev.map(t => t.id === track.id ? {...t, isSolo: !t.isSolo} : t)); }} 
                                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${track.isSolo ? 'bg-yellow-500 text-black' : 'bg-gray-700 hover:bg-gray-600'}`}
                                        >S</button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-gray-400 w-4">Vol</span>
                                        <input 
                                            type="range" min="-60" max="25" value={track.volume} 
                                            onClick={e => e.stopPropagation()}
                                            onChange={e => setTracks(prev => prev.map(t => t.id === track.id ? {...t, volume: Number(e.target.value)} : t))}
                                            className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500" 
                                        />
                                        <span className="text-[10px] w-8 text-right">{track.volume}dB</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-gray-400 w-4">Pan</span>
                                        <input 
                                            type="range" min="-1" max="1" step="0.1" value={track.pan} 
                                            onClick={e => e.stopPropagation()}
                                            onChange={e => setTracks(prev => prev.map(t => t.id === track.id ? {...t, pan: Number(e.target.value)} : t))}
                                            className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500" 
                                        />
                                        <span className="text-[10px] w-8 text-right">
                                            {track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.abs(track.pan * 100).toFixed(0)}` : `R${(track.pan * 100).toFixed(0)}`}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button 
                            onClick={() => setTracks([...tracks, { id: crypto.randomUUID(), name: "Track " + (tracks.length + 1), isMuted: false, isSolo: false, volume: -6, pan: 0, clips: [] }])} 
                            className="p-3 text-sm text-gray-400 hover:bg-gray-800 hover:text-white text-left transition-colors"
                        >
                            + Add Track
                        </button>
                    </div>

                    {/* TIMELINE (Right) */}
                    <div className="flex-1 bg-gray-950 overflow-x-auto overflow-y-hidden relative" ref={timelineRef}>
                        {/* Time Ruler */}
                        <div className="h-6 bg-gray-900 border-b border-gray-800 sticky top-0 z-20 flex">
                            {Array.from({ length: 120 }).map((_, i) => (
                                <div key={i} className="flex-shrink-0 border-l border-gray-700 text-[10px] text-gray-500 pl-1" style={{ width: `${PX_PER_SEC}px` }}>
                                    {i}s
                                </div>
                            ))}
                        </div>

                        {/* Playhead */}
                        <div className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-30 pointer-events-none" style={{ left: `${currentTime * PX_PER_SEC}px` }}>
                            <div className="w-3 h-3 bg-red-500 -ml-[5px] rotate-45 -mt-1"></div>
                        </div>

                        {tracks.map(track => (
                            <div 
                                key={track.id} 
                                className={`h-28 border-b border-gray-800 relative ${track.isMuted ? 'opacity-50' : ''} ${selectedTrackId === track.id ? 'bg-purple-900/10' : 'bg-gray-900/30'}`}
                                style={{ minWidth: `${120 * PX_PER_SEC}px` }}
                            >
                                {/* Grid Lines */}
                                <div className="absolute inset-0 pointer-events-none opacity-10" 
                                    style={{ backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px)`, backgroundSize: `${PX_PER_SEC / 2}px 100%` }} 
                                />

                                {track.clips.map(clip => (
                                    <div
                                        key={clip.id}
                                        className={`absolute h-[90%] top-[5%] rounded-md overflow-hidden border-2 cursor-pointer group select-none transition-all ${
                                            selectedClipId === clip.id ? 'border-white ring-2 ring-white/50 shadow-lg' : 'border-transparent hover:border-white/30'
                                        }`}
                                        style={{
                                            left: `${clip.startTime * PX_PER_SEC}px`,
                                            width: `${clip.duration * PX_PER_SEC}px`,
                                        }}
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
                                                trackId: track.id,
                                                startX: e.clientX,
                                                originalStart: clip.startTime,
                                                originalDuration: clip.duration
                                            });
                                        }}
                                    >
                                        {/* Waveform */}
                                        <div className={`w-full h-full flex items-center ${clip.color || "bg-blue-600"}`}>
                                            <div className="flex items-center gap-[1px] h-full w-full px-1">
                                                {(clip.waveformData || Array(50).fill(0.2)).map((val, i) => (
                                                    <div key={i} className="flex-1 bg-black/40 rounded-full min-w-[1px]" style={{ height: `${Math.max(val * 100, 10)}%` }} />
                                                ))}
                                            </div>
                                        </div>

                                        {/* Clip Name */}
                                        <span className="absolute top-1 left-2 text-[10px] font-bold text-white drop-shadow-md truncate max-w-[calc(100%-16px)]">
                                            {clip.name}
                                        </span>

                                        {/* Duration Label */}
                                        <span className="absolute bottom-1 right-2 text-[9px] text-white/60">
                                            {clip.duration.toFixed(1)}s
                                        </span>

                                        {/* Resize Handle (Right) */}
                                        <div 
                                            className="absolute right-0 top-0 bottom-0 w-3 hover:bg-white/30 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setDragState({
                                                    type: 'RESIZE_R',
                                                    clipId: clip.id,
                                                    trackId: track.id,
                                                    startX: e.clientX,
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
            ) : (
                /* --- UPLOAD TAB --- */
                <div className="flex-1 bg-gray-950 overflow-y-auto p-8 flex justify-center">
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
                                        onChange={(e) => setUploadForm({...uploadForm, title: e.target.value})}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                                        placeholder="e.g. Midnight Vibes"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-300">Genre</label>
                                    <select 
                                        value={uploadForm.genre}
                                        onChange={(e) => setUploadForm({...uploadForm, genre: e.target.value})}
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
                                        onChange={(e) => setUploadForm({...uploadForm, bpm: e.target.value})}
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
                                        onChange={(e) => setUploadForm({...uploadForm, price: e.target.value})}
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
                                    onChange={(e) => setUploadForm({...uploadForm, description: e.target.value})}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500 h-24 resize-none"
                                    placeholder="Tell us about your track..."
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Tags (comma separated)</label>
                                <input 
                                    type="text" 
                                    value={uploadForm.tags}
                                    onChange={(e) => setUploadForm({...uploadForm, tags: e.target.value})}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                                    placeholder="e.g. Dark, Melodic, 140BPM"
                                />
                            </div>

                            <button 
                                type="submit" 
                                disabled={isUploading}
                                className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-[1.01] ${
                                    isUploading ? "bg-gray-600 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
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
