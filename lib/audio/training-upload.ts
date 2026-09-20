import { getSupabaseBrowser } from '@/lib/auth/supabase-browser';
import type { LanguageId, ModeId } from '@/types/speaking';

type TrainingUpload = {
  id: string;
  audio: Blob;
  language: LanguageId;
  mode: ModeId;
  question?: string;
  transcript: string;
  durationSeconds: number;
};

function extension(type: string) {
  if (type.includes('mp4')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('wav')) return 'wav';
  return 'webm';
}

function formatUploadError(stage: string, error: unknown): Error {
  const value = error as { code?: string; statusCode?: string | number; message?: string } | null;
  const detail = value?.code || value?.statusCode || value?.message || 'UNKNOWN';
  return new Error(`TRAINING_${stage}_${String(detail).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80)}`);
}

export async function uploadTrainingAudio(input: TrainingUpload): Promise<string> {
  const client = getSupabaseBrowser();
  if (!client) throw new Error('TRAINING_UPLOAD_NOT_CONFIGURED');
  const { data: userData } = await client.auth.getUser();
  const user = userData.user;
  if (!user || user.user_metadata?.oral_training_consent !== 'training') throw new Error('TRAINING_CONSENT_REQUIRED');

  const contentType = input.audio.type.split(';', 1)[0] || 'audio/webm';
  const path = `${user.id}/${input.id}.${extension(contentType)}`;
  const { error: uploadError } = await client.storage.from('training-audio').upload(path, input.audio, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw formatUploadError('STORAGE', uploadError);

  const { error: metadataError } = await client.from('training_audio_contributions').insert({
    user_id: user.id,
    local_audio_id: input.id,
    object_path: path,
    mime_type: contentType,
    language: input.language,
    training_mode: input.mode,
    question: input.question || null,
    transcript: input.transcript,
    duration_seconds: input.durationSeconds,
    consent_version: '2026-09-20-v1',
  });
  if (metadataError) {
    await client.storage.from('training-audio').remove([path]);
    throw formatUploadError('METADATA', metadataError);
  }
  return path;
}

export async function deleteMyTrainingAudio(): Promise<void> {
  const client = getSupabaseBrowser();
  if (!client) return;
  const { data: userData } = await client.auth.getUser();
  const user = userData.user;
  if (!user) return;

  const { data: files, error: listError } = await client.storage.from('training-audio').list(user.id, { limit: 1000 });
  if (listError) throw listError;
  const paths = (files || []).map(file => `${user.id}/${file.name}`);
  if (paths.length) {
    const { error } = await client.storage.from('training-audio').remove(paths);
    if (error) throw error;
  }
  const { error } = await client.from('training_audio_contributions').delete().eq('user_id', user.id);
  if (error) throw error;
}
