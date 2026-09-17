import type { SpeechProvider } from './speech-provider';
import { BasicSpeechProvider } from './providers/basic-provider';
import { GlmSpeechProvider } from './providers/glm-provider';
export function getSpeechProvider(): SpeechProvider { const selected = process.env.SPEECH_PROVIDER || 'glm'; if (selected === 'basic') return new BasicSpeechProvider(); if (selected === 'glm') return new GlmSpeechProvider(); throw new Error(`Unsupported speech provider: ${selected}`); }
