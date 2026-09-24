import { describe, expect, it, vi } from 'vitest';
import { observeVisualViewport } from './visual-viewport';

function fixture() {
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
  const values = new Map<string, string>();
  const style = { setProperty: (key: string, value: string) => values.set(key, value), removeProperty: (key: string) => values.delete(key) };
  let pending: FrameRequestCallback | undefined;
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => { pending = callback; return 1; });
  const cancelAnimationFrame = vi.fn(() => { pending = undefined; });
  const host = { visualViewport: viewport, document: { documentElement: { style } }, requestAnimationFrame, cancelAnimationFrame } as unknown as Parameters<typeof observeVisualViewport>[0];
  const flush = () => { const callback = pending; pending = undefined; callback?.(0); };
  return { host, viewport, values, requestAnimationFrame, cancelAnimationFrame, flush };
}

describe('mobile dialog viewport', () => {
  it('tracks keyboard height and Safari visual scrolling in one animation frame', () => {
    const f = fixture(); const stop = observeVisualViewport(f.host);
    expect(f.values.get('--oral-viewport-height')).toBe('844px');
    f.viewport.height = 340; f.viewport.offsetTop = 120;
    f.viewport.dispatchEvent(new Event('resize')); f.viewport.dispatchEvent(new Event('scroll'));
    expect(f.requestAnimationFrame).toHaveBeenCalledOnce(); f.flush();
    expect(f.values.get('--oral-viewport-height')).toBe('340px');
    expect(f.values.get('--oral-viewport-top')).toBe('120px');
    stop();
  });
  it('restores the full viewport when the keyboard closes', () => {
    const f = fixture(); f.viewport.height = 300; const stop = observeVisualViewport(f.host);
    f.viewport.height = 844; f.viewport.dispatchEvent(new Event('resize')); f.flush();
    expect(f.values.get('--oral-viewport-height')).toBe('844px'); stop();
  });
  it('preserves pinch zoom and ignores invalid viewport sizes', () => {
    const f = fixture(); const stop = observeVisualViewport(f.host);
    f.viewport.scale = 2; f.viewport.dispatchEvent(new Event('resize')); f.flush(); expect(f.values.size).toBe(0);
    f.viewport.scale = 1; f.viewport.height = 0; f.viewport.dispatchEvent(new Event('resize')); f.flush(); expect(f.values.size).toBe(0);
    f.viewport.height = 600; f.viewport.offsetTop = -5; f.viewport.dispatchEvent(new Event('resize')); f.flush();
    expect(f.values.get('--oral-viewport-top')).toBe('0px'); stop();
  });
  it('cancels pending work and listeners on cleanup', () => {
    const f = fixture(); const stop = observeVisualViewport(f.host);
    f.viewport.dispatchEvent(new Event('resize')); stop(); f.flush();
    expect(f.cancelAnimationFrame).toHaveBeenCalledWith(1); expect(f.values.size).toBe(0);
    f.viewport.dispatchEvent(new Event('resize')); expect(f.requestAnimationFrame).toHaveBeenCalledOnce();
  });
  it('leaves CSS fallback sizing available without VisualViewport', () => {
    const f = fixture();
    expect(() => observeVisualViewport({ ...f.host, visualViewport: null })()).not.toThrow(); expect(f.values.size).toBe(0);
  });
});
