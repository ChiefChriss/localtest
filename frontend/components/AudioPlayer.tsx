import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface AudioPlayerProps {
    url: string;
    height?: number;
    waveColor?: string;
    progressColor?: string;
}

const AudioPlayer = ({
    url,
    height = 50,
    waveColor = '#a855f7', // purple-500
    progressColor = '#3b82f6' // blue-500
}: AudioPlayerProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const wavesurfer = useRef<WaveSurfer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!containerRef.current) return;

        wavesurfer.current = WaveSurfer.create({
            container: containerRef.current,
            waveColor: waveColor,
            progressColor: progressColor,
            height: height,
            cursorWidth: 1,
            cursorColor: '#fff',
            barWidth: 2,
            barGap: 3,
            barRadius: 3,
            normalize: true,
            backend: 'MediaElement',
        });

        wavesurfer.current.load(url);

        wavesurfer.current.on('ready', () => {
            setLoading(false);
        });

        wavesurfer.current.on('play', () => setIsPlaying(true));
        wavesurfer.current.on('pause', () => setIsPlaying(false));
        wavesurfer.current.on('finish', () => setIsPlaying(false));

        return () => {
            wavesurfer.current?.destroy();
        };
    }, [url, height, waveColor, progressColor]);

    const togglePlay = () => {
        wavesurfer.current?.playPause();
    };

    return (
        <div className="flex items-center gap-4 w-full bg-white/5 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
            <button
                onClick={togglePlay}
                disabled={loading}
                className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center text-white shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? (
                    <div className="w-5 h-5 border-2 border-white rounded-full animate-spin border-t-transparent"></div>
                ) : isPlaying ? (
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                    </svg>
                ) : (
                    <svg className="w-5 h-5 fill-current ml-1" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                )}
            </button>

            <div className="flex-grow relative h-full min-h-[50px]" ref={containerRef}>
                {/* WaveSurfer will inject canvas here */}
            </div>
        </div>
    );
};

export default AudioPlayer;
