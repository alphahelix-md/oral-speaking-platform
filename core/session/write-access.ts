export type SessionWriteStatus = 'waiting' | 'ready' | 'unavailable';

// The existing history is one localStorage value. Hold one origin-wide writer
// lease so synchronous read/modify/write operations cannot race across new tabs.
export function createSessionWriteAccess() {
  let owner: symbol | undefined;
  return {
    assert() { if (!owner) throw new Error('SESSION_WRITER_UNAVAILABLE'); },
    hold(onStatus: (status: SessionWriteStatus) => void, manager?: Pick<LockManager, 'request'>): () => void {
      const token = Symbol('session-writer');
      const controller = new AbortController();
      let active = true;
      let release = () => {};
      onStatus('waiting');
      if (!manager) { onStatus('unavailable'); return () => { active = false; }; }
      void Promise.resolve().then(() => manager.request('oral-session-writer-v1', { mode: 'exclusive', signal: controller.signal }, async () => {
        if (!active) return;
        try {
          await new Promise<void>(resolve => {
            release = resolve;
            owner = token;
            onStatus('ready');
          });
        } finally { if (owner === token) owner = undefined; }
      })).catch(() => {
        if (owner === token) owner = undefined;
        release();
        if (active) onStatus('unavailable');
      });
      return () => {
        active = false;
        controller.abort();
        if (owner === token) owner = undefined;
        release();
      };
    },
  };
}
export const sessionWriteAccess = createSessionWriteAccess();


// A back/forward cached page must reacquire ownership before editing again.
export function observeSessionWriteAccess(
  events: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  manager: Pick<LockManager, 'request'> | undefined,
  onStatus: (status: SessionWriteStatus) => void,
  access = sessionWriteAccess,
): () => void {
  let release = access.hold(onStatus, manager);
  const hide = () => { release(); onStatus('waiting'); };
  const show = (event: Event) => {
    if (!(event as PageTransitionEvent).persisted) return;
    release(); release = access.hold(onStatus, manager);
  };
  events.addEventListener('pagehide', hide);
  events.addEventListener('pageshow', show);
  return () => { events.removeEventListener('pagehide', hide); events.removeEventListener('pageshow', show); release(); };
}
