import type { AudioMetrics } from '@/lib/speech/types';
import { calculateAudioMetrics } from '@/lib/speech/metrics';
import { englishSpeechConfig } from '@/languages/en/speech-config';
import { japaneseSpeechConfig } from '@/languages/ja/speech-config';
import type { LanguageId } from '@/types/speaking';
export type RecordedAnswer = { blob: Blob; seconds: number; metrics: AudioMetrics };
export class AudioRecorder {
  private stream?: MediaStream; private recorder?: MediaRecorder; private chunks: Blob[] = []; private startTime = 0; private elapsed = 0;
  private context?: AudioContext; private analyser?: AnalyserNode; private sampleTimer?: ReturnType<typeof setInterval>; private samples: number[] = [];
  constructor(private language: LanguageId = 'en') {}
  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Recording is unsupported in this browser. Use HTTPS or localhost.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); this.chunks = []; this.elapsed = 0; this.samples = [];
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    try { this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined); } catch (error) { this.stream.getTracks().forEach(track => track.stop()); throw error; }
    this.recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
    try { this.context = new AudioContext(); const source = this.context.createMediaStreamSource(this.stream); this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 2048; source.connect(this.analyser); } catch { this.analyser = undefined; }
    this.startTime = performance.now(); this.recorder.start();
    if (this.analyser) { const values = new Uint8Array(this.analyser.fftSize); const config = this.language === 'ja' ? japaneseSpeechConfig : englishSpeechConfig; this.sampleTimer = setInterval(() => { if (this.recorder?.state !== 'recording' || !this.analyser) return; this.analyser.getByteTimeDomainData(values); let sum = 0; for (const value of values) sum += ((value - 128) / 128) ** 2; this.samples.push(Math.sqrt(sum / values.length)); }, config.sampleIntervalMs); }
  }
  pause(): void { if (this.recorder?.state === 'recording') { this.recorder.pause(); this.elapsed += performance.now() - this.startTime; } }
  resume(): void { if (this.recorder?.state === 'paused') { this.startTime = performance.now(); this.recorder.resume(); } }
  get state(): RecordingState | 'inactive' { return this.recorder?.state || 'inactive'; }
  stop(): Promise<RecordedAnswer> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state === 'inactive') return reject(new Error('No recording in progress'));
      if (this.recorder.state === 'recording') this.elapsed += performance.now() - this.startTime;
      if (this.sampleTimer) clearInterval(this.sampleTimer);
      const durationMs = this.elapsed; const metrics = calculateAudioMetrics(this.samples, durationMs, this.language === 'ja' ? japaneseSpeechConfig : englishSpeechConfig);
      this.recorder.onstop = () => { const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' }); this.dispose(); resolve({ blob, seconds: Math.round(durationMs / 1000), metrics }); };
      this.recorder.onerror = () => { this.stream?.getTracks().forEach(t => t.stop()); reject(new Error('Recording failed')); };
      this.recorder.stop();
    });
  }
  dispose(): void { if (this.sampleTimer) clearInterval(this.sampleTimer); if (this.recorder?.state !== 'inactive') this.recorder?.stop(); this.stream?.getTracks().forEach(t => t.stop()); this.context?.close().catch(() => {}); }
}
