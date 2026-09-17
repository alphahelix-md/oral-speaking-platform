import type { LanguageId } from '@/types/speaking';

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { 0: RecognitionAlternative };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: RecognitionEvent) => void) | null; onend: (() => void) | null; start(): void; stop(): void };
type RecognitionConstructor = new () => Recognition;

function getConstructor(): RecognitionConstructor | undefined {
  const browserWindow = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
}

export function browserTranscriptionSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(getConstructor());
}

export class BrowserTranscriber {
  private recognition?: Recognition;
  private text = '';
  private done?: (text: string) => void;

  start(language: LanguageId, onText: (text: string) => void): boolean {
    const Constructor = getConstructor();
    if (!Constructor) return false;
    this.text = '';
    this.recognition = new Constructor();
    this.recognition.lang = language === 'ja' ? 'ja-JP' : 'en-US';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.onresult = event => {
      this.text = Array.from(event.results).map(item => item[0].transcript).join('').trim();
      onText(this.text);
    };
    this.recognition.onend = () => this.complete();
    try { this.recognition.start(); return true; } catch { return false; }
  }

  stop(): Promise<string> {
    const recognition = this.recognition;
    if (!recognition) return Promise.resolve(this.text);
    return new Promise(resolve => {
      this.done = resolve;
      const timeout = setTimeout(() => this.complete(), 900);
      const onEnd = recognition.onend;
      recognition.onend = () => { clearTimeout(timeout); onEnd?.(); this.complete(); };
      try { recognition.stop(); } catch { this.complete(); }
    });
  }

  private complete(): void {
    const resolve = this.done;
    this.done = undefined;
    resolve?.(this.text);
  }
}
