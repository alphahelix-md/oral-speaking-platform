import type { AudioMetrics } from '@/lib/speech/types';
import { calculateAudioMetrics } from '@/lib/speech/metrics';
import { englishSpeechConfig } from '@/languages/en/speech-config';
import { japaneseSpeechConfig } from '@/languages/ja/speech-config';
import type { LanguageId } from '@/types/speaking';
export type RecordedAnswer = { blob: Blob; seconds: number; metrics: AudioMetrics; interrupted?: boolean };
export class AudioRecorder {
  private stream?: MediaStream; private recorder?: MediaRecorder; private chunks: Blob[] = []; private startTime = 0; private elapsed = 0;
  private context?: AudioContext; private analyser?: AnalyserNode; private sampleTimer?: ReturnType<typeof setInterval>; private samples: number[] = [];
  private clockRunning = false; private stopRequested = false; private interrupted = false; private disposed = false;
  private result?: RecordedAnswer; private pendingStop?: Promise<RecordedAnswer>; private resolveStop?: (answer: RecordedAnswer) => void;
  constructor(private language: LanguageId = 'en', private onInterrupted?: () => void) {}
  async start(): Promise<void> {
    if (this.recorder || this.disposed) throw new Error('Recorder has already been used');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Recording is unsupported in this browser. Use HTTPS or localhost.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (this.disposed) { this.releaseResources(); throw new Error('Recording was cancelled'); }
    const isAndroid = /Android/i.test(navigator.userAgent || '');
    const mimeTypes = isAndroid
      ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
      : ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
    const mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t));
    try { this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined); } catch (error) { this.releaseResources(); throw error; }
    this.recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
    // Error and track-end events are followed by dataavailable, then stop. Wait for
    // stop so the final blob is included, even when the browser became inactive first.
    this.recorder.onerror = () => { this.interrupted = true; this.captureElapsed(); };
    this.recorder.onstop = () => this.captureResult();
    try { this.context = new AudioContext(); const source = this.context.createMediaStreamSource(this.stream); this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 2048; source.connect(this.analyser); } catch { this.analyser = undefined; }
    this.startTime = performance.now();
    try { this.recorder.start(); this.clockRunning = true; } catch (error) { this.releaseResources(); throw error; }
    if (this.analyser) { const values = new Uint8Array(this.analyser.fftSize); const config = this.language === 'ja' ? japaneseSpeechConfig : englishSpeechConfig; this.sampleTimer = setInterval(() => { if (this.recorder?.state !== 'recording' || !this.analyser) return; this.analyser.getByteTimeDomainData(values); let sum = 0; for (const value of values) sum += ((value - 128) / 128) ** 2; this.samples.push(Math.sqrt(sum / values.length)); }, config.sampleIntervalMs); }
  }
  private captureElapsed(): void {
    if (this.clockRunning) this.elapsed += performance.now() - this.startTime;
    this.clockRunning = false;
  }
  private captureResult(): void {
    if (this.result) return;
    this.captureElapsed();
    const interrupted = this.interrupted || !this.stopRequested;
    this.result = {
      blob: new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' }),
      seconds: Math.round(this.elapsed / 1000),
      metrics: calculateAudioMetrics(this.samples, this.elapsed, this.language === 'ja' ? japaneseSpeechConfig : englishSpeechConfig),
      interrupted,
    };
    this.releaseResources();
    this.resolveStop?.(this.result);
    if (interrupted && !this.disposed) this.onInterrupted?.();
  }
  private releaseResources(): void {
    if (this.sampleTimer) { clearInterval(this.sampleTimer); this.sampleTimer = undefined; }
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined;
    this.context?.close().catch(() => {}); this.context = undefined;
  }
  pause(): void { if (this.recorder?.state === 'recording') { this.recorder.pause(); this.captureElapsed(); } }
  resume(): void { if (this.recorder?.state === 'paused') { this.recorder.resume(); this.startTime = performance.now(); this.clockRunning = true; } }
  get elapsedSeconds(): number {
    return Math.max(0, Math.round((this.elapsed + (this.clockRunning ? performance.now() - this.startTime : 0)) / 1000));
  }
  get state(): RecordingState | 'inactive' { return this.recorder?.state || 'inactive'; }
  stop(): Promise<RecordedAnswer> {
    if (this.result) return Promise.resolve(this.result);
    if (this.pendingStop) return this.pendingStop;
    if (!this.recorder || this.disposed) return Promise.reject(new Error('No recording in progress'));
    // An inactive recorder may still have its final data/stop events queued.
    this.pendingStop = new Promise(resolve => { this.resolveStop = resolve; });
    if (this.recorder.state !== 'inactive') {
      this.stopRequested = true;
      this.captureElapsed();
      this.recorder.stop();
    }
    return this.pendingStop;
  }
  dispose(): void {
    this.disposed = true;
    this.captureElapsed();
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.releaseResources();
  }
}
