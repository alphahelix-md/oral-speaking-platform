import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteAudio, deleteAudioMany, saveAudio, updateAudioMetadata } from './store';

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
