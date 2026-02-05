import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as Tone from "tone";
import Logo from './components/Logo';
import { generateWaveform } from './utils/waveform';

// CONSTANTS
const PX_PER_SEC = 50; // 1 second = 50 pixels wide
const SNAP_GRID = 0.25; // Snap resolution in seconds (1/4 note at 120BPM)

// Helper: Snap time to grid
const snapTime = (rawTime: number): number => {
    return Math.round(rawTime / SNAP_GRID) * SNAP_GRID;
};

interface Clip {
    id: string;
    url: string;           // Blob URL or server URL of the recording
    fileId?: number;       // Server file ID (if saved)
    startTime: number;     // In Seconds (e.g., 2.5)
    duration: number;      // In Seconds
    name: string;
    waveformData?: number[]; // Real waveform data for display
}

interface Track {
    id: string;
    name: string;
    isMuted: boolean;
    isSolo: boolean;    // Solo this track
    volume: number;     // -60 to 0 dB
    pan: number;        // -1 (Left) to 1 (Right)
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
        { id: "1", name: "Beat", isMuted: false, isSolo: false, volume: -5, pan: 0, clips: [] },
        { id: "2", name: "Vocals", isMuted: false, isSolo: false, volume: 0, pan: 0, clips: [] }
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
    const [isMetronomeOn, setIsMetronomeOn] = useState(false);

    // TAB STATE (Create vs Upload)
    const [activeTab, setActiveTab] = useState<'create' | 'upload'>('create');

    // UPLOAD TAB STATE
    const [uploadForm, setUploadForm] = useState({
        title: "",
        genre: "",
        bpm: "",
        price: "",
        description: "",
        tags: "",
    });
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [coverArt, setCoverArt] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

    // REFS (Audio Engine)
    const playersRef = useRef<Map<string, Tone.Player>>(new Map());
    const channelsRef = useRef<Map<string, Tone.Channel>>(new Map());
    const recorderRef = useRef<Tone.Recorder | null>(null);
    const micRef = useRef<Tone.UserMedia | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const metronomeRef = useRef<Tone.Loop | null>(null);
    const metronomeClickRef = useRef<Tone.MembraneSynth | null>(null);

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

        // Initialize metronome click sound
        metronomeClickRef.current = new Tone.MembraneSynth({
            pitchDecay: 0.008,
            octaves: 2,
            envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }
        }).toDestination();
        metronomeClickRef.current.volume.value = -10;

        return () => {
            micRef.current?.dispose();
            recorderRef.current?.dispose();
            playersRef.current.forEach(p => p.dispose());
            channelsRef.current.forEach(c => c.dispose());
            metronomeRef.current?.dispose();
            metronomeClickRef.current?.dispose();
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    // 2. BPM SYNC
    useEffect(() => {
        Tone.Transport.bpm.value = bpm;
    }, [bpm]);

    // 3. SYNC TRACK STATE TO TONE.JS CHANNELS (Volume, Pan, Mute, Solo)
    useEffect(() => {
        tracks.forEach(track => {
            // Create Channel if missing
            if (!channelsRef.current.has(track.id)) {
                const channel = new Tone.Channel({
                    volume: track.volume,
                    pan: track.pan,
                    mute: track.isMuted,
                    solo: track.isSolo
                }).toDestination();
                channelsRef.current.set(track.id, channel);
            }

            // Update Channel Properties
            const channel = channelsRef.current.get(track.id);
            if (channel) {
                channel.volume.rampTo(track.volume, 0.1);
                channel.pan.rampTo(track.pan, 0.1);
                channel.mute = track.isMuted;
                channel.solo = track.isSolo;
            }
        });
    }, [tracks]);

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

    // Helper: Toggle metronome
    const startMetronome = () => {
        if (metronomeRef.current) {
            metronomeRef.current.dispose();
            metronomeRef.current = null;
        }

        if (isMetronomeOn && metronomeClickRef.current) {
            // Create a loop that clicks on each beat
            const loop = new Tone.Loop((time) => {
                metronomeClickRef.current?.triggerAttackRelease("C5", "32n", time);
            }, "4n"); // Every quarter note
            
            loop.start(0);
            metronomeRef.current = loop;
        }
    };

    const stopMetronome = () => {
        if (metronomeRef.current) {
            metronomeRef.current.stop();
            metronomeRef.current.dispose();
            metronomeRef.current = null;
        }
    };

    // 4. PLAYBACK LOGIC
    const handlePlay = async () => {
        await Tone.start();

        if (isPlaying) {
            // STOP: Cancel transport and stop all players
            Tone.Transport.stop();
            Tone.Transport.cancel();
            stopAllPlayers();
            stopMetronome();
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            setIsPlaying(false);
            setCurrentTime(0);
            Tone.Transport.seconds = 0;
        } else {
            // PLAY: Schedule all clips
            Tone.Transport.cancel();
            stopAllPlayers();

            tracks.forEach(track => {
                // Skip muted tracks (solo handled by Channel)
                if (track.isMuted) return;

                track.clips.forEach(clip => {
                    // Create a player if it doesn't exist
                    if (!playersRef.current.has(clip.id)) {
                        const player = new Tone.Player(clip.url);
                        // Connect to the track's mixer channel
                        const channel = channelsRef.current.get(track.id);
                        if (channel) {
                            player.connect(channel);
                        } else {
                            player.toDestination(); // Fallback
                        }
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

            // Start metronome if enabled
            startMetronome();

            Tone.Transport.start();
            setIsPlaying(true);
            animationFrameRef.current = requestAnimationFrame(updatePlayhead);
        }
    };

    // 5. RECORDING LOGIC
    const handleRecord = async () => {
        if (isRecording) {
            // STOP RECORDING
            const blob = await recorderRef.current?.stop();
            if (blob) {
                const url = URL.createObjectURL(blob);

                // Calculate duration using Tone.js
                const buffer = await new Tone.ToneAudioBuffer().load(url);
                const duration = buffer.duration;

                // Generate real waveform data
                const waveformData = await generateWaveform(url);

                // Snap start time to grid
                const snappedStartTime = snapTime(recordStartTime);

                // Add the new Clip to the selected track
                const newClip: Clip = {
                    id: crypto.randomUUID(),
                    url,
                    startTime: snappedStartTime,
                    duration: duration,
                    name: `Recording ${new Date().toLocaleTimeString()}`,
                    waveformData
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
            stopAllPlayers();
            stopMetronome();
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
            stopAllPlayers();
            // Snap the recording start time to grid
            setRecordStartTime(snapTime(Tone.Transport.seconds));
            recorderRef.current?.start();
            
            // Start metronome if enabled
            startMetronome();
            
            Tone.Transport.start();
            setIsPlaying(true);
            setIsRecording(true);
            animationFrameRef.current = requestAnimationFrame(updatePlayhead);
        }
    };

    // 6. ADD TRACK
    const addTrack = () => {
        const newTrack: Track = {
            id: crypto.randomUUID(),
            name: `Track ${tracks.length + 1}`,
            isMuted: false,
            isSolo: false,
            volume: 0,
            pan: 0,
            clips: []
        };
        setTracks([...tracks, newTrack]);
    };

    // 7. TOGGLE MUTE
    const toggleMute = (trackId: string) => {
        setTracks(tracks.map(t =>
            t.id === trackId ? { ...t, isMuted: !t.isMuted } : t
        ));
    };

    // 8. TOGGLE SOLO
    const toggleSolo = (trackId: string) => {
        setTracks(tracks.map(t =>
            t.id === trackId ? { ...t, isSolo: !t.isSolo } : t
        ));
    };

    // 7. DELETE CLIP
    const deleteClip = (trackId: string, clipId: string) => {
        // 1. Find the clip to clean up memory
        const track = tracks.find(t => t.id === trackId);
        const clip = track?.clips.find(c => c.id === clipId);
        
        // 2. Revoke blob URL to free memory
        if (clip && clip.url.startsWith('blob:')) {
            URL.revokeObjectURL(clip.url);
        }

        // 3. Remove from state
        setTracks(tracks.map(t =>
            t.id === trackId
                ? { ...t, clips: t.clips.filter(c => c.id !== clipId) }
                : t
        ));
        
        // 4. Dispose player
        const player = playersRef.current.get(clipId);
        if (player) {
            player.dispose();
            playersRef.current.delete(clipId);
        }
    };

    // 9. CLEAR ALL
    const clearAll = () => {
        // Stop everything first
        Tone.Transport.stop();
        Tone.Transport.cancel();
        stopAllPlayers();
        stopMetronome();
        setIsPlaying(false);
        setIsRecording(false);
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        
        // Revoke all blob URLs to free memory
        tracks.forEach(track => {
            track.clips.forEach(clip => {
                if (clip.url.startsWith('blob:')) {
                    URL.revokeObjectURL(clip.url);
                }
            });
        });
        
        // Reset tracks
        setTracks([
            { id: "1", name: "Beat", isMuted: false, isSolo: false, volume: -5, pan: 0, clips: [] },
            { id: "2", name: "Vocals", isMuted: false, isSolo: false, volume: 0, pan: 0, clips: [] }
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

        // Generate real waveform data
        const waveformData = await generateWaveform(url);

        const newClip: Clip = {
            id: crypto.randomUUID(),
            url,
            startTime: 0,
            duration: buffer.duration,
            name: file.name,
            waveformData
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
        // Snap clip to grid on drop
        if (dragState) {
            setTracks(prev => prev.map(track =>
                track.id === dragState.trackId
                    ? {
                        ...track,
                        clips: track.clips.map(clip =>
                            clip.id === dragState.clipId
                                ? { ...clip, startTime: snapTime(clip.startTime) }
                                : clip
                        )
                    }
                    : track
            ));
        }
        setDragState(null);
    }, [dragState]);

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

    // 12. UPLOAD TAB SUBMIT HANDLER
    const handleUploadSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) return alert("Please log in first.");
        if (!audioFile) return alert("Please select an audio file.");

        setIsUploading(true);
        const formData = new FormData();
        
        // Append text fields
        formData.append('title', uploadForm.title);
        formData.append('genre', uploadForm.genre);
        if (uploadForm.bpm) formData.append('bpm', uploadForm.bpm);
        if (uploadForm.price) formData.append('price', uploadForm.price);
        formData.append('description', uploadForm.description);
        if (uploadForm.tags) formData.append('tags', uploadForm.tags);
        
        // Append files
        formData.append('audio_file', audioFile);
        if (coverArt) formData.append('cover_art', coverArt);

        try {
            const res = await fetch(`${API_BASE_URL}/api/music/tracks/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    // Note: Do NOT set 'Content-Type' manually when sending FormData
                },
                body: formData
            });

            if (res.ok) {
                alert("Track uploaded successfully!");
                // Reset form
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

    // 13. SAVE AND REDIRECT (update URL after creating new project)
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
                {/* Tab Switcher */}
                <div className="bg-gray-900 border-b border-white/10 p-4 flex justify-center gap-4">
                    <button 
                        onClick={() => setActiveTab('create')}
                        className={`px-6 py-2 rounded-full font-bold transition-all ${activeTab === 'create' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                    >
                        🎹 Create (DAW)
                    </button>
                    <button 
                        onClick={() => setActiveTab('upload')}
                        className={`px-6 py-2 rounded-full font-bold transition-all ${activeTab === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                    >
                        ☁️ Upload Existing
                    </button>
                </div>

                {activeTab === 'create' ? (
                <>
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

                    {/* Metronome Toggle */}
                    <button
                        onClick={() => setIsMetronomeOn(!isMetronomeOn)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${isMetronomeOn
                            ? "bg-orange-500 text-white"
                            : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                            }`}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                        </svg>
                        <span className="hidden lg:inline">{isMetronomeOn ? "Metro ON" : "Metro"}</span>
                    </button>

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
                    {/* Track Headers (Left Panel) - Mixer */}
                    <div className="w-52 bg-gray-900 border-r border-white/10 flex-shrink-0 overflow-y-auto">
                        {tracks.map(track => (
                            <div
                                key={track.id}
                                onClick={() => setSelectedTrackId(track.id)}
                                className={`h-36 p-3 border-b border-white/10 cursor-pointer transition-colors ${selectedTrackId === track.id
                                    ? "bg-purple-900/30 border-l-4 border-l-purple-500"
                                    : "hover:bg-white/5"
                                    }`}
                            >
                                {/* Track Name & Mute/Solo Buttons */}
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-medium text-sm truncate w-24">{track.name}</span>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleMute(track.id);
                                            }}
                                            className={`text-xs px-2 py-1 rounded font-bold ${track.isMuted
                                                ? "bg-red-500 text-white"
                                                : "bg-white/10 text-gray-400 hover:bg-white/20"
                                                }`}
                                        >
                                            M
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSolo(track.id);
                                            }}
                                            className={`text-xs px-2 py-1 rounded font-bold ${track.isSolo
                                                ? "bg-yellow-500 text-black"
                                                : "bg-white/10 text-gray-400 hover:bg-white/20"
                                                }`}
                                        >
                                            S
                                        </button>
                                    </div>
                                </div>

                                {/* Volume Slider */}
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] text-gray-400 w-6">Vol</span>
                                    <input
                                        type="range"
                                        min="-60"
                                        max="0"
                                        value={track.volume}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            setTracks(prev => prev.map(t =>
                                                t.id === track.id ? { ...t, volume: val } : t
                                            ));
                                        }}
                                        className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                    />
                                    <span className="text-[10px] text-gray-500 w-8 text-right">{track.volume}dB</span>
                                </div>

                                {/* Pan Slider */}
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] text-gray-400 w-6">Pan</span>
                                    <input
                                        type="range"
                                        min="-1"
                                        max="1"
                                        step="0.1"
                                        value={track.pan}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            setTracks(prev => prev.map(t =>
                                                t.id === track.id ? { ...t, pan: val } : t
                                            ));
                                        }}
                                        className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                    />
                                    <span className="text-[10px] text-gray-500 w-8 text-right">
                                        {track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.abs(track.pan * 100).toFixed(0)}` : `R${(track.pan * 100).toFixed(0)}`}
                                    </span>
                                </div>

                                {/* Clip count */}
                                <div className="text-[10px] text-gray-500">
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
                                className={`h-36 border-b border-white/5 relative ${track.isMuted ? 'opacity-50' : ''
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

                                        {/* Real Waveform Display */}
                                        <div className="h-full flex items-center pointer-events-none px-1">
                                            <div className="flex items-center gap-px h-10 w-full">
                                                {(clip.waveformData || Array(50).fill(0.2)).map((val, i) => (
                                                    <div
                                                        key={i}
                                                        className="flex-1 bg-white/60 rounded-full min-w-[1px]"
                                                        style={{ height: `${Math.max(val * 100, 10)}%` }}
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
                </>
                ) : (
                /* ================= UPLOAD UI ================= */
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
                                    <div className={`
                                        border-2 border-dashed rounded-xl p-8 text-center transition-all
                                        ${audioFile ? 'border-green-500 bg-green-500/10' : 'border-white/10 group-hover:border-blue-500 bg-white/5'}
                                    `}>
                                        {audioFile ? (
                                            <div className="text-green-400 font-medium">
                                                ✅ Selected: {audioFile.name}
                                            </div>
                                        ) : (
                                            <div className="text-gray-400">
                                                <span className="text-2xl block mb-2">📂</span>
                                                <span className="font-medium text-white">Click to browse</span> or drag file here
                                                <p className="text-xs mt-1 text-gray-500">MP3 or WAV (Max 50MB)</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* Audio Preview */}
                                {audioFile && (
                                    <div className="mt-2 bg-gray-800 p-3 rounded-lg flex items-center gap-3">
                                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                                            🎵
                                        </div>
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

                            {/* Metadata Inputs */}
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
                                        min={40}
                                        max={300}
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
        </div>
    );
}
