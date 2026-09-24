import { afterEach, expect, it, vi } from 'vitest';
import { readPreference, writePreference } from './preferences';
afterEach(() => vi.unstubAllGlobals());
it('keeps the manual UI usable when accessing storage itself is denied', () => {
  const target = {};
  Object.defineProperty(target, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } });
  Object.defineProperty(target, 'sessionStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } });
  vi.stubGlobal('window', target);
  expect(readPreference('oral-ui-language')).toBeNull();
  expect(() => writePreference('oral-theme', 'dark')).not.toThrow();
  expect(() => writePreference('oral-beta-access-code', null, 'sessionStorage')).not.toThrow();
});
it('does not crash practice when optional preference writes hit quota', () => {
  vi.stubGlobal('window', { localStorage: { setItem() { throw new DOMException('Full', 'QuotaExceededError'); } } });
  expect(() => writePreference('oral-theme', 'dark')).not.toThrow();
});
