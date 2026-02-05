import * as Tone from "tone";

export const generateWaveform = async (url: string, samples: number = 50): Promise<number[]> => {
    try {
        // Load the audio buffer
        const buffer = await new Tone.ToneAudioBuffer().load(url);
        const rawData = buffer.getChannelData(0); // Get left channel
        const blockSize = Math.floor(rawData.length / samples);
        const waveform: number[] = [];

        // Downsample the data (take averages)
        for (let i = 0; i < samples; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(rawData[i * blockSize + j]);
            }
            waveform.push(sum / blockSize);
        }

        // Normalize (scale to 0-1)
        const multiplier = Math.max(...waveform);
        if (multiplier === 0) return Array(samples).fill(0.1);
        return waveform.map(n => n / multiplier);
    } catch (e) {
        console.error("Waveform generation failed:", e);
        return Array(samples).fill(0.1); // Fallback on error
    }
};
