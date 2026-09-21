const DB_NAME = 'oral-audio-v1';
const STORE_NAME = 'records';

export type AudioMetadata = {
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
    });
  } finally { db.close(); }
}

export async function getAudio(id: string): Promise<Blob | undefined> {
  const db = await openDB();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result ? unpack(id, request.result as StoredAudio).blob : undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
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
        entries.push(unpack(String(cursor.key), cursor.value as StoredAudio));
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
    });
  } finally { db.close(); }
}

export async function deleteAudio(id: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
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
      for (const id of new Set(ids)) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
