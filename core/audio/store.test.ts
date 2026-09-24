import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteAudio, deleteAudioMany, getAudio, getVerifiedAudio, saveAudio, saveOriginalAudio, updateAudioMetadata } from './store';

afterEach(() => vi.unstubAllGlobals());

function database(outcome: 'abort' | 'complete') {
  const close = vi.fn();
  const tx = {
    error: null,
    oncomplete: undefined as undefined | (() => void),
    onerror: undefined as undefined | (() => void),
    onabort: undefined as undefined | (() => void),
    objectStore: () => ({ put: vi.fn(), delete: vi.fn(), get: () => ({}) }),
  };
  const request = {
    result: { close, transaction: () => {
      queueMicrotask(() => outcome === 'abort' ? tx.onabort?.() : tx.oncomplete?.());
      return tx;
    } },
    onsuccess: undefined as undefined | (() => void),
  };
  vi.stubGlobal('indexedDB', { open: () => {
    queueMicrotask(() => request.onsuccess?.());
    return request;
  } });
  return close;
}

describe('audio transaction completion', () => {
  const operations = [
    () => saveAudio('test', new Blob(['synthetic audio'])),
    () => updateAudioMetadata('test', { transcript: 'synthetic' }),
    () => deleteAudio('test'),
    () => deleteAudioMany(['test']),
  ];
  it.each(operations)('rejects explicit transaction abort and closes the database', async operation => {
    const close = database('abort');
    await expect(operation()).rejects.toThrow('AUDIO_TRANSACTION_ABORTED');
    expect(close).toHaveBeenCalledOnce();
  });
  it('waits for transaction completion before reporting save success', async () => {
    const close = database('complete');
    await expect(saveAudio('test', new Blob(['synthetic audio']))).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });
});

// Faithful transaction ordering with injected readback faults; no browser dependency.
function memoryDatabase(fault?: 'missing' | 'bytes' | 'mime' | 'write' | 'read-abort') {
  const records = new Map<string, unknown>();
  const close = vi.fn();
  vi.stubGlobal('indexedDB', { open: () => {
    const open: any = { result: { close, transaction: (_name: string, mode?: string) => {
      const tx: any = { error: null };
      let pending: (() => void) | undefined;
      tx.objectStore = () => ({
        put: (value: unknown, key: string) => { pending = () => records.set(key, value); },
        get: (key: string) => {
          const request: any = {};
          queueMicrotask(() => {
            let value: any = records.get(key);
            if (fault === 'missing') value = undefined;
            if (value && fault === 'bytes') value = { ...value, blob: new Blob(['corrupt'], { type: value.blob.type }) };
            if (value && fault === 'mime') value = { ...value, blob: new Blob(['rawdata'], { type: 'audio/mp4' }) };
            request.result = value; request.onsuccess?.();
          });
          return request;
        },
      });
      queueMicrotask(() => queueMicrotask(() => {
        if (mode === 'readwrite' && fault === 'write' || mode !== 'readwrite' && fault === 'read-abort') tx.onabort?.();
        else { pending?.(); tx.oncomplete?.(); }
      }));
      return tx;
    } } };
    queueMicrotask(() => open.onsuccess?.()); return open;
  } });
  return { records, close };
}

describe('original recording verification', () => {
  const original = () => new Blob(['rawdata'], { type: 'audio/webm' });
  const metadata = { createdAt: '2026-09-24', sessionId: 'session', turnId: 'turn' };
  it('stores raw bytes before derivatives and verifies original on reload', async () => {
    const { records } = memoryDatabase();
    await saveOriginalAudio('raw', original(), metadata);
    await saveAudio('raw:wav', new Blob(['normalized'], { type: 'audio/wav' }), { ...metadata, kind: 'derived' });
    expect(await (await getVerifiedAudio('raw')).text()).toBe('rawdata');
    expect(await (await getAudio('raw:wav'))!.text()).toBe('normalized');
    expect((records.get('raw') as any).metadata).toMatchObject({ kind: 'original', trainingConsent: false, turnId: 'turn' });
  });
  it.each(['missing', 'bytes', 'mime'] as const)('rejects %s readback including same-size corruption', async fault => {
    memoryDatabase(fault);
    await expect(saveOriginalAudio('raw', original(), metadata)).rejects.toThrow('AUDIO_READBACK_MISMATCH');
  });
  it.each(['write', 'read-abort'] as const)('rejects %s transaction abort', async fault => {
    memoryDatabase(fault);
    await expect(saveOriginalAudio('raw', original(), metadata)).rejects.toThrow('AUDIO_TRANSACTION_ABORTED');
  });
  it('refuses zero-byte audio before opening a database', async () => {
    memoryDatabase();
    await expect(saveOriginalAudio('raw', new Blob([]), metadata)).rejects.toThrow('EMPTY_AUDIO');
  });
  it('detects changed MIME metadata even when stored bytes are unchanged', async () => {
    const { records } = memoryDatabase(); await saveOriginalAudio('raw', original(), metadata);
    const value: any = records.get('raw'); records.set('raw', { ...value, blob: new Blob(['rawdata'], { type: 'audio/mp4' }) });
    await expect(getVerifiedAudio('raw')).rejects.toThrow('AUDIO_READBACK_MISMATCH');
  });
  it('detects bytes corrupted after an earlier successful save', async () => {
    const { records } = memoryDatabase(); await saveOriginalAudio('raw', original(), metadata);
    const value: any = records.get('raw'); records.set('raw', { ...value, blob: new Blob(['corrupt']) });
    await expect(getVerifiedAudio('raw')).rejects.toThrow('AUDIO_READBACK_MISMATCH');
  });
});
