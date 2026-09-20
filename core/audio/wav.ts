const SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 25;

function encodeWav(samples: Float32Array): File {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const write = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const clipped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
  }
  return new File([bytes], 'answer.wav', { type: 'audio/wav' });
}

export async function recordedAudioToWavChunks(blob: Blob, measuredDurationSeconds?: number): Promise<File[]> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel));
    const sourceFrames = Math.min(...channels.map(channel => channel.length));
    const pcmDurationSeconds = sourceFrames / decoded.sampleRate;
    const durationSeconds = measuredDurationSeconds && measuredDurationSeconds > 0
      ? Math.min(pcmDurationSeconds, measuredDurationSeconds + 1)
      : pcmDurationSeconds;
    const frames = Math.ceil(durationSeconds * SAMPLE_RATE);
    const mono = new Float32Array(frames);
    for (const source of channels) {
      for (let frame = 0; frame < frames; frame++) {
        const position = frame * decoded.sampleRate / SAMPLE_RATE;
        const low = Math.min(source.length - 1, Math.floor(position));
        const high = Math.min(source.length - 1, low + 1);
        mono[frame] += (source[low] + (source[high] - source[low]) * (position - low)) / channels.length;
      }
    }
    const chunkFrames = SAMPLE_RATE * CHUNK_SECONDS;
    const chunks: File[] = [];
    for (let at = 0; at < mono.length; at += chunkFrames) chunks.push(encodeWav(mono.subarray(at, at + chunkFrames)));
    return chunks;
  } finally {
    await context.close();
  }
}
