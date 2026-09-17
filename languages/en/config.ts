import type { LanguageConfig } from '@/types/speaking';
export const english: LanguageConfig = {
  id: 'en', name: 'English', nativeName: 'English', flag: 'EN', accent: 'blue', description: 'Build confidence, one conversation at a time.', speechLocale: 'en-US',
  levels: ['Beginner', 'Intermediate', 'Advanced', 'B2', 'C1'], modes: ['ielts', 'daily', 'topic', 'free-talk', 'toefl', 'weakness'],
  topics: { daily: ['Everyday life', 'Food & drink', 'Travel', 'Work & study'], ielts: ['Full mock · Parts 1–3', 'Part 1 · Familiar topics', 'Part 2 · Long turn', 'Part 3 · Discussion'], topic: ['Technology', 'Culture', 'Education'], 'free-talk': ['Open conversation'] },
  fallbackQuestions: { daily: ['What was the best part of your day?', 'What do you usually do to unwind?', 'Tell me about a place you enjoy visiting.'], ielts: ['Do you work or study?', 'What do you enjoy doing in your free time?', 'Describe a place you would like to visit and explain why.'], topic: ['How has technology changed the way you learn?'], 'free-talk': ['What would you like to talk about today?'] },
  rubric: [{ key: 'fluency', label: 'Fluency & coherence', guide: 'Flow, development, and linking of ideas' }, { key: 'vocabulary', label: 'Lexical resource', guide: 'Range and precision of word choice' }, { key: 'grammar', label: 'Grammar', guide: 'Range and accuracy of structures' }, { key: 'pronunciation', label: 'Pronunciation', guide: 'Only score with actual audio evidence' }],
  weaknesses: ['Grammar', 'Vocabulary', 'Fluency', 'Pronunciation', 'Sentence structure'],
  conversationPrompt: 'Speak natural English. Ask one question per turn and follow up on the learner’s answer. Do not interrupt to correct mistakes. Keep replies brief.',
  evaluationPrompt: 'Give constructive English speaking feedback. Identify concrete transcript evidence. Pronunciation is unassessed unless audio was analyzed. Do not claim an official exam score.'
};
