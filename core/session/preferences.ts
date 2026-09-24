// Preferences are optional. A blocked/full browser store must not crash the
// practice UI before users can type, download audio, or export their draft.
export function readPreference(key: string, area: 'localStorage' | 'sessionStorage' = 'localStorage'): string | null {
  try { return window[area].getItem(key); } catch { return null; }
}
export function writePreference(key: string, value: string | null, area: 'localStorage' | 'sessionStorage' = 'localStorage'): void {
  try { if (value === null) window[area].removeItem(key); else window[area].setItem(key, value); } catch { /* Keep in-memory preferences. */ }
}
