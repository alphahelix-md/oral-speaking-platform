import type { LanguageId } from '@/types/speaking';
import type { TranscriptResult } from './types';
export interface SpeechProvider { readonly id: string; transcribe(audio: File, language: LanguageId, requestId?: string, requestFetch?: typeof fetch): Promise<TranscriptResult> }
// Future capabilities stay separate; basic transcription is never pronunciation scoring.
export interface PronunciationProvider { analyze(audio: File, transcript: TranscriptResult): Promise<{ status: 'professional'; score: number; note: string }> }
export interface RealtimeSpeechProvider { connect(language: LanguageId): Promise<unknown> }
