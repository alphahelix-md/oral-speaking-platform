import { updateAudioMetadata, type AudioMetadata } from './store';
import { RequestNotSentError } from '@/core/session/recovery';

// Legacy recordings live outside draft sessions. Keep their request receipts with
// the audio, and atomically claim each chunk before making a billable request.
export async function transcribeLegacyAudio(
  id: string,
  chunks: File[],
  request: (chunk: File, index: number, requestId: string) => Promise<string>,
  onSaved: (metadata: AudioMetadata) => void,
): Promise<string> {
  if (!chunks.length) throw new Error('EMPTY_TRANSCRIPT');
  let transcript = '';
  for (const [index, chunk] of chunks.entries()) {
    const claimed = await updateAudioMetadata(id, current => {
      const recovery = current.transcriptionRecovery || {
        requestId: `sp_${crypto.randomUUID()}`,
        chunks: (current.transcriptionChunks || []).map(text => ({ status: 'succeeded' as const, text })),
      };
      const state = recovery.chunks[index];
      if (state && state.status !== 'succeeded') throw new Error('TRANSCRIPTION_UNCERTAIN');
      if (state) return { transcriptionRecovery: recovery };
      const states = [...recovery.chunks];
      states[index] = { status: 'running' };
      return { transcriptionRecovery: { ...recovery, chunks: states } };
    });
    const receipt = claimed.transcriptionRecovery!;
    transcript = receipt.chunks.map(part => part?.text || '').join(' ').trim();
    if (receipt.chunks[index]?.status === 'succeeded') continue;
    let text: string;
    try { text = await request(chunk, index, receipt.requestId); }
    catch (error) {
      await updateAudioMetadata(id, current => {
        const states = [...current.transcriptionRecovery!.chunks];
        if (error instanceof RequestNotSentError) states.splice(index, 1);
        else states[index] = { status: 'uncertain' };
        return { transcriptionRecovery: { ...receipt, chunks: states } };
      });
      if (error instanceof RequestNotSentError) throw error;
      throw new Error('TRANSCRIPTION_UNCERTAIN', { cause: error });
    }
    const saved = await updateAudioMetadata(id, current => {
      const states = [...current.transcriptionRecovery!.chunks];
      states[index] = { status: 'succeeded', text };
      const parts = states.map(part => part?.text || '');
      return { transcriptionRecovery: { ...receipt, chunks: states }, transcriptionChunks: parts, transcript: parts.join(' ').trim() };
    });
    transcript = saved.transcript || '';
    onSaved(saved);
  }
  if (!transcript) throw new Error('EMPTY_TRANSCRIPT');
  return transcript;
}
