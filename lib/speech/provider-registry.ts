import type { SpeechProvider } from './speech-provider';
import { BasicSpeechProvider } from './providers/basic-provider';
import { GlmSpeechProvider } from './providers/glm-provider';
import { resolveSpeechProvider } from '@/lib/runtime/region';
export function getSpeechProvider(): SpeechProvider { const selected = resolveSpeechProvider(); if (selected === 'basic') return new BasicSpeechProvider(); return new GlmSpeechProvider(); }
