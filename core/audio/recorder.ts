export type RecordedAnswer = { blob: Blob; seconds: number };
export class AudioRecorder {
  private stream?: MediaStream; private recorder?: MediaRecorder; private chunks: Blob[] = []; private startTime = 0; private elapsed = 0;
  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Recording is unsupported in this browser. Use HTTPS or localhost.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); this.chunks = []; this.elapsed = 0;
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
    this.startTime = Date.now(); this.recorder.start();
  }
  pause(): void { if (this.recorder?.state === 'recording') { this.recorder.pause(); this.elapsed += Date.now() - this.startTime; } }
  resume(): void { if (this.recorder?.state === 'paused') { this.startTime = Date.now(); this.recorder.resume(); } }
  get state(): RecordingState | 'inactive' { return this.recorder?.state || 'inactive'; }
  stop(): Promise<RecordedAnswer> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state === 'inactive') return reject(new Error('No recording in progress'));
      if (this.recorder.state === 'recording') this.elapsed += Date.now() - this.startTime;
      this.recorder.onstop = () => { this.stream?.getTracks().forEach(t => t.stop()); resolve({ blob: new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' }), seconds: Math.max(1, Math.round(this.elapsed / 1000)) }); };
      this.recorder.onerror = () => { this.stream?.getTracks().forEach(t => t.stop()); reject(new Error('Recording failed')); };
      this.recorder.stop();
    });
  }
  dispose(): void { if (this.recorder?.state !== 'inactive') this.recorder?.stop(); this.stream?.getTracks().forEach(t => t.stop()); }
}
