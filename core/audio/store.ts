const DB_NAME = 'oral-audio-v1';
const STORE_NAME = 'records';

export type AudioMetadata = {
  kind?: 'original' | 'derived';
  sha256?: string;
  originalByteLength?: number;
  originalMimeType?: string;
  createdAt: string;
  language?: 'en' | 'ja';
  mode?: string;
  question?: string;
  durationSeconds?: number;
  sessionId?: string;
  turnId?: string;
  transcript?: string;
  transcriptionChunks?: string[];
  trainingConsent: boolean;
  trainingStoragePath?: string;
  trainingUploadedAt?: string;
  trainingUploadStatus?: 'pending' | 'uploaded' | 'failed';
  trainingUploadError?: string;
};

export type AudioLibraryEntry = { id: string; blob: Blob; metadata: AudioMetadata | null };
type StoredAudio = Blob | { blob: Blob; metadata: AudioMetadata };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function unpack(id: string, stored: StoredAudio): AudioLibraryEntry {
  if (stored instanceof Blob) return { id, blob: stored, metadata: null };
  return { id, blob: stored.blob, metadata: stored.metadata };
}

export async function saveAudio(id: string, audio: Blob, metadata?: Omit<AudioMetadata, 'trainingConsent'>): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const value: StoredAudio = metadata ? { blob: audio, metadata: { ...metadata, trainingConsent: false } } : audio;
      tx.objectStore(STORE_NAME).put(value, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('AUDIO_TRANSACTION_ABORTED'));
    });
  } finally { db.close(); }
}

async function digest(audio: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await audio.arrayBuffer());
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function saveOriginalAudio(id: string, audio: Blob, metadata: Omit<AudioMetadata, 'trainingConsent'>): Promise<void> {
  if (!audio.size) throw new Error('EMPTY_AUDIO');
  const sha256 = await digest(audio);
  await saveAudio(id, audio, { ...metadata, kind: 'original', sha256, originalByteLength: audio.size, originalMimeType: audio.type });
  const stored = await getVerifiedAudio(id);
  if (!stored || stored.size !== audio.size || stored.type !== audio.type || await digest(stored) !== sha256) {
    throw new Error('AUDIO_READBACK_MISMATCH');
  }
}

export async function getVerifiedAudio(id: string): Promise<Blob> {
  const entry = await getAudioEntry(id);
  if (!entry?.blob.size || !entry.metadata?.sha256
    || entry.metadata.originalByteLength !== undefined && entry.blob.size !== entry.metadata.originalByteLength
    || entry.metadata.originalMimeType !== undefined && entry.blob.type !== entry.metadata.originalMimeType
    || await digest(entry.blob) !== entry.metadata.sha256) {
    throw new Error('AUDIO_READBACK_MISMATCH');
  }
  return entry.blob;
}

export async function getAudioEntry(id: string): Promise<AudioLibraryEntry | undefined> {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME);
      const request = tx.objectStore(STORE_NAME).get(id);
      let entry: AudioLibraryEntry | undefined;
      request.onsuccess = () => { entry = request.result ? unpack(id, request.result as StoredAudio) : undefined; };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(entry);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('AUDIO_TRANSACTION_ABORTED'));
    });
  } finally { db.close(); }
}

export async function getAudio(id: string): Promise<Blob | undefined> {
  return (await getAudioEntry(id))?.blob;
}

export async function getPlaybackAudio(id: string): Promise<Blob | undefined> {
  try { const derived = await getAudio(`${id}:wav`); if (derived?.size) return derived; }
  catch { /* The optional playback cache must not hide the original. */ }
  return getAudio(id);
}

export async function listAudio(): Promise<AudioLibraryEntry[]> {
  const db = await openDB();
  try {
    return await new Promise<AudioLibraryEntry[]>((resolve, reject) => {
      const store = db.transaction(STORE_NAME).objectStore(STORE_NAME);
      const entries: AudioLibraryEntry[] = [];
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(entries); return; }
        const entry = unpack(String(cursor.key), cursor.value as StoredAudio);
        if (entry.metadata?.kind !== 'derived') entries.push(entry);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function updateAudioMetadata(id: string, changes: Partial<AudioMetadata>): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) return;
        const current = unpack(id, request.result as StoredAudio);
        store.put({ blob: current.blob, metadata: { ...current.metadata, createdAt: current.metadata?.createdAt || new Date().toISOString(), trainingConsent: current.metadata?.trainingConsent || false, ...changes } }, id);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('AUDIO_TRANSACTION_ABORTED'));
    });
  } finally { db.close(); }
}

export async function deleteAudio(id: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.objectStore(STORE_NAME).delete(`${id}:wav`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('AUDIO_TRANSACTION_ABORTED'));
    });
  } finally { db.close(); }
}

export async function deleteAudioMany(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const id of new Set(ids)) { store.delete(id); store.delete(`${id}:wav`); }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('AUDIO_TRANSACTION_ABORTED'));
    });
  } finally { db.close(); }
}
