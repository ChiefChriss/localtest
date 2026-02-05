import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Link } from 'react-router-dom';
import * as Tone from "tone";
import Logo from './components/Logo';

// Define the rows of our sequencer (Kick, Snare, HiHat, Melody)
const INITIAL_GRID = [
    { name: "Kick", note: "C2", active: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] },
    { name: "Snare", note: "D2", active: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0] },
    { name: "HiHat", note: "G2", active: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
    { name: "Synth", note: "C4", active: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0] },
];

export default function Studio() {
    const [grid, setGrid] = useState(INITIAL_GRID);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [projectName, setProjectName] = useState("My New Beat");

    const saveProject = async () => {
        const token = localStorage.getItem("accessToken");
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

        if (!token) {
            alert("You must be logged in to save!");
            return;
        }

        try {
            const payload = {
                title: projectName,
                bpm: 120, // To be made dynamic later
                grid_data: grid,
            };

            const response = await axios.post(`${API_BASE_URL}/api/music/projects/`, payload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            });

            alert("Project Saved Successfully!");
            console.log("Saved:", response.data);

        } catch (error) {
            console.error("Failed to save:", error);
            alert("Error saving project.");
        }
    };

    // Refs to store the Tone.js instruments so they don't re-create on every render
    const synthRef = useRef<Tone.PolySynth | null>(null);
    const drumRef = useRef<Tone.MembraneSynth | null>(null);
    const hatRef = useRef<Tone.MetalSynth | null>(null);

    // 1. Initialize Audio Engine (Runs once)
    useEffect(() => {
        synthRef.current = new Tone.PolySynth().toDestination();
        drumRef.current = new Tone.MembraneSynth().toDestination();
        hatRef.current = new Tone.MetalSynth({
            envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
            harmonicity: 5.1,
            modulationIndex: 32,
            resonance: 4000,
            octaves: 1.5,
        }).toDestination();

        return () => {
            // Cleanup when leaving the page
            synthRef.current?.dispose();
            drumRef.current?.dispose();
            hatRef.current?.dispose();
        };
    }, []);

    // 2. The Sequencer Loop
    useEffect(() => {
        const loop = new Tone.Sequence(
            (time, step) => {
                // Update the visual UI step
                setCurrentStep(step);

                // Trigger sounds based on the Grid state
                grid.forEach((row) => {
                    if (row.active[step] === 1) {
                        if (row.name === "Kick") drumRef.current?.triggerAttackRelease(row.note, "8n", time);
                        if (row.name === "Snare") drumRef.current?.triggerAttackRelease(row.note, "8n", time);
                        if (row.name === "HiHat") hatRef.current?.triggerAttackRelease("32n", time, -10); // Lower volume
                        if (row.name === "Synth") synthRef.current?.triggerAttackRelease(row.note, "8n", time);
                    }
                });
            },
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], // 16 steps
            "16n"
        ).start(0);

        return () => {
            loop.dispose();
        };
    }, [grid]); // Re-create loop if grid changes (simple version)

    // 3. Handle Play/Stop
    const handlePlay = async () => {
        await Tone.start(); // Required by browser to start audio context

        if (isPlaying) {
            Tone.Transport.stop();
            setIsPlaying(false);
            setCurrentStep(0);
        } else {
            Tone.Transport.start();
            setIsPlaying(true);
        }
    };

    // 4. Handle Grid Clicks
    const toggleStep = (rowIndex: number, stepIndex: number) => {
        const newGrid = [...grid];
        newGrid[rowIndex].active[stepIndex] = newGrid[rowIndex].active[stepIndex] === 1 ? 0 : 1;
        setGrid(newGrid);
    };

    return (
        <div className="flex bg-black text-white min-h-screen">
            {/* Sidebar - Retaining navigation from previous setup */}
            <div className="w-20 lg:w-64 border-r border-white/10 flex flex-col p-4 bg-white/5 backdrop-blur-xl h-screen fixed left-0 top-0 z-20">
                <div className="mb-8 flex justify-center lg:justify-start">
                    <Link to="/">
                        <Logo size="md" showText={false} className="lg:hidden" />
                        <Logo size="md" showText={true} className="hidden lg:flex" />
                    </Link>
                </div>
                <nav className="space-y-2 flex-grow">
                    <Link to="/studio" className="flex items-center gap-3 p-3 rounded-xl bg-purple-600/20 text-purple-300 font-medium">
                        <span>🎛️</span>
                        <span className="hidden lg:block">Studio</span>
                    </Link>
                    <Link to="/my-songs" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
                        <span>🎵</span>
                        <span className="hidden lg:block">My Songs</span>
                    </Link>
                    <Link to="/" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
                        <span>🏠</span>
                        <span className="hidden lg:block">Home</span>
                    </Link>
                </nav>
            </div>

            <div className="flex-grow ml-20 lg:ml-64 p-8 relative flex flex-col items-center justify-center">
                {/* Background Effect */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                    <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-purple-900/20 rounded-full mix-blend-screen filter blur-[120px] opacity-30"></div>
                </div>

                <div className="relative z-10 w-full max-w-4xl">
                    <div className="flex items-center justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">Studio</h1>
                            <p className="text-gray-400">Sequence your beat.</p>
                        </div>
                        <div className="flex gap-4 items-center">
                            <input
                                type="text"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
                                placeholder="Project Name"
                            />
                            <button
                                onClick={saveProject}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-colors shadow-lg shadow-blue-900/30"
                            >
                                SAVE PROJECT
                            </button>
                            <button
                                onClick={handlePlay}
                                className={`px-8 py-3 rounded-xl font-bold transition-all shadow-lg ${isPlaying
                                    ? "bg-red-500 hover:bg-red-600 shadow-red-900/30"
                                    : "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-green-900/30"
                                    }`}
                            >
                                {isPlaying ? "STOP" : "PLAY"}
                            </button>
                        </div>
                    </div>

                    <div className="bg-gray-900/80 border border-white/10 p-8 rounded-3xl shadow-2xl backdrop-blur-md">
                        {grid.map((row, rowIndex) => (
                            <div key={row.name} className="flex items-center mb-6 last:mb-0">
                                <div className="w-24 font-mono text-sm font-bold text-gray-400 uppercase tracking-widest">{row.name}</div>
                                <div className="flex gap-1.5 flex-1">
                                    {row.active.map((isActive, stepIndex) => (
                                        <div
                                            key={stepIndex}
                                            onClick={() => toggleStep(rowIndex, stepIndex)}
                                            className={`
                            h-16 flex-1 rounded-lg cursor-pointer transition-all border border-white/5
                            ${isActive
                                                    ? "bg-gradient-to-t from-purple-600 to-pink-500 shadow-[0_0_15px_rgba(168,85,247,0.4)] border-transparent"
                                                    : "bg-white/5 hover:bg-white/10"
                                                }
                            ${currentStep === stepIndex ? "border-white/50 border-2 scale-105 brightness-125 z-10" : ""}
                            ${stepIndex % 4 === 0 && stepIndex !== 0 ? "ml-2" : ""} 
                        `}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 flex justify-end">
                        <button className="bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors border border-white/5">
                            Clear Grid
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
