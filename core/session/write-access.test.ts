import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionWriteAccess, observeSessionWriteAccess, sessionWriteAccess } from './write-access';
import { createSession } from '@/core/speaking/engine';
import { deleteSessions, getSessions, saveSession } from './storage';

// Model browser FIFO granting and cancellation. Actual multi-tab browser evidence
// remains a separate acceptance check.
function manager() {
  const queue: any[] = []; let held = false;
  function pump() {
    if (held || !queue.length) return;
    const item = queue.shift(); held = true;
    item.signal.removeEventListener('abort', item.cancel);
    Promise.resolve().then(() => item.callback({ name: 'oral-session-writer-v1', mode: 'exclusive' }))
      .then(item.resolve, item.reject).finally(() => { held = false; pump(); });
  }
  return { request: vi.fn((name: string, options: LockOptions, callback: LockGrantedCallback<unknown>) => new Promise((resolve, reject) => {
    expect(name).toBe('oral-session-writer-v1'); expect(options.mode).toBe('exclusive');
    const signal = options.signal!;
    if (signal.aborted) { reject(signal.reason); return; }
    const item: any = { callback, resolve, reject, signal };
    item.cancel = () => { const at = queue.indexOf(item); if (at >= 0) queue.splice(at, 1); reject(signal.reason); };
    signal.addEventListener('abort', item.cancel, { once: true }); queue.push(item); pump();
  })) } as unknown as Pick<LockManager, 'request'>;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('exclusive session writer', () => {
  it('grants one window and transfers ownership only after release', async () => {
    const locks = manager(); const first = createSessionWriteAccess(); const second = createSessionWriteAccess();
    const firstState = vi.fn(); const secondState = vi.fn();
    const closeFirst = first.hold(firstState, locks); const closeSecond = second.hold(secondState, locks);
    try {
      await vi.waitFor(() => expect(firstState).toHaveBeenLastCalledWith('ready'));
      expect(() => first.assert()).not.toThrow(); expect(() => second.assert()).toThrow('SESSION_WRITER_UNAVAILABLE');
      closeFirst(); expect(() => first.assert()).toThrow();
      await vi.waitFor(() => expect(secondState).toHaveBeenLastCalledWith('ready'));
      expect(() => second.assert()).not.toThrow();
    } finally { closeFirst(); closeSecond(); }
  });
  it('cancels a waiting window without giving it ownership later', async () => {
    const locks = manager(); const first = createSessionWriteAccess(); const second = createSessionWriteAccess(); const third = createSessionWriteAccess();
    const closeFirst = first.hold(vi.fn(), locks); const state = vi.fn(); const closeSecond = second.hold(state, locks); const thirdState = vi.fn();
    await vi.waitFor(() => expect(() => first.assert()).not.toThrow());
    closeSecond(); const closeThird = third.hold(thirdState, locks); closeFirst();
    try {
      await vi.waitFor(() => expect(thirdState).toHaveBeenLastCalledWith('ready'));
      expect(state).not.toHaveBeenCalledWith('ready'); expect(() => second.assert()).toThrow();
    } finally { closeThird(); }
  });
  it('survives Strict Mode acquire/cleanup/acquire without clearing the new owner', async () => {
    const access = createSessionWriteAccess(); const locks = manager();
    const releaseOld = access.hold(vi.fn(), locks); releaseOld();
    const state = vi.fn(); const releaseNew = access.hold(state, locks);
    try {
      await vi.waitFor(() => expect(state).toHaveBeenLastCalledWith('ready'));
      releaseOld(); expect(() => access.assert()).not.toThrow();
    } finally { releaseNew(); }
  });
  it('fails closed when the browser cannot supply a writer lock', async () => {
    const access = createSessionWriteAccess(); const state = vi.fn();
    access.hold(state); expect(state).toHaveBeenLastCalledWith('unavailable'); expect(() => access.assert()).toThrow();
    const close = access.hold(state, { request: vi.fn().mockRejectedValue(new Error('SecurityError')) });
    await vi.waitFor(() => expect(state).toHaveBeenLastCalledWith('unavailable'));
    expect(() => access.assert()).toThrow(); close();
  });
  it('never changes history before a writer lease or after releasing it', async () => {
    const values = new Map<string, string>();
    const storage = { getItem: vi.fn((key: string) => values.get(key) || null), setItem: vi.fn((key: string, value: string) => values.set(key, value)) };
    vi.stubGlobal('localStorage', storage);
    const session = createSession('en', 'daily', 'Beginner', 'Food', 'Question');
    expect(() => saveSession(session)).toThrow('SESSION_WRITER_UNAVAILABLE');
    const state = vi.fn(); const close = sessionWriteAccess.hold(state, manager());
    await vi.waitFor(() => expect(state).toHaveBeenLastCalledWith('ready'));
    const saved = saveSession(session); close();
    expect(() => saveSession(saved)).toThrow('SESSION_WRITER_UNAVAILABLE');
    expect(() => deleteSessions([saved.id])).toThrow('SESSION_WRITER_UNAVAILABLE');
    expect(getSessions()).toEqual([saved]); expect(storage.setItem).toHaveBeenCalledOnce();
  });
});


describe('page lifecycle', () => {
  it('reacquires after a cached page returns and cannot write while another page owns the lock', async () => {
    const locks = manager(); const events = new EventTarget(); const access = createSessionWriteAccess(); const other = createSessionWriteAccess();
    const state = vi.fn(); const stop = observeSessionWriteAccess(events, locks, state, access);
    await vi.waitFor(() => expect(state).toHaveBeenLastCalledWith('ready'));
    events.dispatchEvent(new Event('pagehide')); expect(() => access.assert()).toThrow();
    const otherState = vi.fn(); const closeOther = other.hold(otherState, locks);
    await vi.waitFor(() => expect(otherState).toHaveBeenLastCalledWith('ready'));
    const show = new Event('pageshow'); Object.defineProperty(show, 'persisted', { value: true }); events.dispatchEvent(show);
    expect(() => access.assert()).toThrow(); expect(state).toHaveBeenLastCalledWith('waiting');
    closeOther(); await vi.waitFor(() => expect(state).toHaveBeenLastCalledWith('ready'));
    stop(); events.dispatchEvent(show); expect(() => access.assert()).toThrow();
  });
});
