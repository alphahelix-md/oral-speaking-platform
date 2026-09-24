import { afterEach, expect, it, vi } from 'vitest';
import { prepareQuestionAudio } from './question-audio';
afterEach(() => vi.unstubAllGlobals());
it('reuses fetched question audio when persistent cache is full', async () => {
  vi.stubGlobal('window', { caches: {}, setTimeout, clearTimeout });
  vi.stubGlobal('location', { origin: 'http://localhost' });
  const cache = { match: vi.fn().mockRejectedValue(new Error('Cache read failed')), put: vi.fn().mockRejectedValue(new Error('Storage full')) };
  vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) });
  const fetcher = vi.fn().mockResolvedValue(new Response(new Blob(['synthetic speech'], { type: 'audio/mpeg' })));
  vi.stubGlobal('fetch', fetcher);
  const input = { text: 'Storage failure fixture', language: 'en' as const, mode: 'daily' as const, level: 'Beginner' };
  expect(await (await prepareQuestionAudio(input, {})).text()).toBe('synthetic speech');
  await prepareQuestionAudio(input, {});
  expect(fetcher).toHaveBeenCalledOnce(); expect(cache.put).toHaveBeenCalledOnce();
});
