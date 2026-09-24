// One deadline covers preparation, I/O and response consumption.
export async function withDeadline<T>(timeoutMs: number, task: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Invalid request timeout');
  parent?.throwIfAborted();
  const controller = new AbortController();
  let cancel!: () => void;
  const expired = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      const error = parent?.aborted ? parent.reason : new DOMException('Request deadline exceeded', 'TimeoutError');
      controller.abort(error); reject(error);
    };
  });
  const timer = setTimeout(cancel, timeoutMs);
  parent?.addEventListener('abort', cancel, { once: true });
  try {
    return await Promise.race([Promise.resolve().then(async () => {
      controller.signal.throwIfAborted();
      const result = await task(controller.signal);
      controller.signal.throwIfAborted();
      return result;
    }), expired]);
  } finally { clearTimeout(timer); parent?.removeEventListener('abort', cancel); }
}
