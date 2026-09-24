import type { LanguageId, ModeId } from '@/types/speaking';

const cacheName = 'oral-question-audio-v1';
const memory = new Map<string, Promise<Blob>>();

export type QuestionAudioInput = {
  text: string;
  language: LanguageId;
  mode: ModeId;
  level: string;
};

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function cacheKey(input: QuestionAudioInput) {
  const key = await hash(JSON.stringify(input));
  return new Request(`${location.origin}/__oral-question-audio/${key}.mp3`);
}

async function requestAudio(input: QuestionAudioInput, headers: Record<string, string>) {
  const key = await cacheKey(input);
  if ('caches' in window) {
    try {
      const cached = await caches.open(cacheName).then(cache => cache.match(key));
      if (cached) { const blob = await cached.blob(); if (blob.size) return blob; }
    } catch { /* Cache unavailability does not prevent question playback. */ }
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TTS_${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('TTS_EMPTY_AUDIO');
    if ('caches' in window) {
      try {
        const cache = await caches.open(cacheName);
        await cache.put(key, new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/mpeg' } }));
      } catch { /* Use received audio even when local cache storage is full. */ }
    }
    return blob;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function questionAudioKey(input: QuestionAudioInput) {
  return JSON.stringify(input);
}

export function prepareQuestionAudio(input: QuestionAudioInput, headers: Record<string, string>) {
  const key = questionAudioKey(input);
  const existing = memory.get(key);
  if (existing) return existing;
  const pending = requestAudio(input, headers).catch(error => {
    memory.delete(key);
    throw error;
  });
  memory.set(key, pending);
  return pending;
}
