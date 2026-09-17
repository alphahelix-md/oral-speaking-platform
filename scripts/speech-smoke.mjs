// Usage: node --env-file=.env.local scripts/speech-smoke.mjs en path/to/short.wav
// Sends one short audio file to the configured GLM provider without opening the UI.
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { GlmSpeechProvider } from '../lib/speech/providers/glm-provider.ts';

const [language, filePath] = process.argv.slice(2);
if (!['en', 'ja'].includes(language) || !filePath) {
  console.error('Usage: node --env-file=.env.local scripts/speech-smoke.mjs en|ja short.wav');
  process.exitCode = 2;
} else {
  try {
    const data = await readFile(filePath);
    const file = new File([data], basename(filePath), { type: 'audio/wav' });
    const result = await new GlmSpeechProvider().transcribe(file, language, `sp_smoke_${Date.now()}`);
    console.log(JSON.stringify({ success: true, provider: result.provider, language: result.language, text: result.text }));
  } catch (error) {
    console.error(JSON.stringify({ success: false, name: error?.name, message: error?.message, causeCode: error?.cause?.code, causeMessage: error?.cause?.message }));
    process.exitCode = 1;
  }
}
