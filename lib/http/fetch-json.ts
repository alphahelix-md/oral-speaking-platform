import { withDeadline } from './deadline';
type RequestOptions = Omit<RequestInit, 'signal'>;
export function fetchJsonWithTimeout<T>(input: RequestInfo | URL, options: RequestOptions | (() => Promise<RequestOptions>), timeoutMs: number): Promise<{ response: Response; data: T }> {
  return withDeadline(timeoutMs, async signal => {
    const init = typeof options === 'function' ? await options() : options;
    // Delayed authentication must not send after the caller has timed out.
    signal.throwIfAborted();
    const response = await fetch(input, { ...init, signal });
    const data = await response.json() as T;
    return { response, data };
  });
}
