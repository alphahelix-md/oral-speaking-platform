import type { ModeConfig, ModeId } from '@/types/speaking';
import { ielts } from '@/exams/ielts/config';
import { toefl } from '@/exams/toefl/config';
export const modes: Record<ModeId, ModeConfig> = {
  ielts, toefl,
  daily: { id: 'daily', title: 'Daily Conversation', short: 'Everyday fluency', role: 'Conversation Partner', icon: 'messages', description: 'Talk about your life in a relaxed, natural flow.', enabled: true, maxTurns: 6, prompt: 'Be a warm conversation partner. Follow up naturally. Ask one question at a time. Do not interrupt with corrections.' },
  scenario: { id: 'scenario', title: 'Scenario Practice', short: 'Real-life moments', role: 'Scenario Partner', icon: 'map', description: 'Rehearse practical situations with a role-play partner.', enabled: true, maxTurns: 6, prompt: 'Act as the person in the selected scenario. Stay in role. One question at a time. Do not correct during the conversation.' },
  topic: { id: 'topic', title: 'Topic Practice', short: 'Go deeper', role: 'Conversation Partner', icon: 'layers', description: 'Explore one subject with thoughtful follow-ups.', enabled: false, maxTurns: 6, prompt: '' },
  'free-talk': { id: 'free-talk', title: 'Free Talk', short: 'Open conversation', role: 'Conversation Partner', icon: 'mic', description: 'Choose your own direction.', enabled: false, maxTurns: 6, prompt: '' },
  interview: { id: 'interview', title: 'Interview Practice', short: 'Coming soon', role: 'Interviewer', icon: 'briefcase', description: 'Prepare for interviews in Japanese.', enabled: false, maxTurns: 6, prompt: '' },
  weakness: { id: 'weakness', title: 'Weakness Practice', short: 'Coming soon', role: 'Coach', icon: 'target', description: 'Target patterns from your past sessions.', enabled: false, maxTurns: 6, prompt: '' }
};
