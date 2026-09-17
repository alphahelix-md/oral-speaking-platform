export type SpeechDiagnostic = {
  requestId?: string;
  browser?: string;
  mediaRecorderSupported?: boolean;
  supportedFormats?: string;
  recordedMime?: string;
  blobSize?: number;
  durationSeconds?: number;
  fileName?: string;
  fileMime?: string;
  fileSize?: number;
  formField?: string;
  requestUrl?: string;
  requestCount?: number;
  uploadStatus?: string;
  httpStatus?: number;
  requestDurationMs?: number;
  serverReceived?: boolean;
  serverFileSize?: number;
  serverMime?: string;
  provider?: string;
  model?: string;
  errorCode?: string;
};

export function SpeechDebugPanel({ diagnostic }: { diagnostic: SpeechDiagnostic }) {
  if (process.env.NEXT_PUBLIC_SPEECH_DEBUG !== 'true') return null;
  return <details className="speech-debug-panel" open>
    <summary>Speech diagnostics</summary>
    <pre>{JSON.stringify(diagnostic, null, 2)}</pre>
  </details>;
}
