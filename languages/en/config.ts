import type { LanguageConfig } from '@/types/speaking';
export const english: LanguageConfig = {
  id: 'en', name: 'English', nativeName: 'English', flag: 'EN', accent: 'blue', description: 'Build confidence, one conversation at a time.', speechLocale: 'en-US',
  levels: ['Beginner', 'Intermediate', 'Advanced', 'B2', 'C1'], modes: ['ielts', 'daily', 'topic', 'free-talk', 'toefl', 'weakness'],
  topics: { daily: ['Everyday life', 'Food & drink', 'Travel', 'Work & study'], ielts: ['Full mock · Parts 1–3', 'Part 1 · Familiar topics', 'Part 2 · Long turn', 'Part 3 · Discussion'], topic: ['Technology', 'Culture', 'Education'], 'free-talk': ['Open conversation'] },
  fallbackQuestions: { daily: ['What was the best part of your day?', 'What do you usually do to unwind?', 'Tell me about a place you enjoy visiting.'], ielts: ['Do you work or study?', 'What do you enjoy doing in your free time?', 'Describe a place you would like to visit and explain why.'], topic: ['How has technology changed the way you learn?'], 'free-talk': ['What would you like to talk about today?'] },
  rubric: [{ key: 'coherence', label: 'Coherence', guide: 'Development and linking of ideas in transcript; not acoustic fluency' }, { key: 'vocabulary', label: 'Vocabulary', guide: 'Range and precision of word choice' }, { key: 'grammar', label: 'Grammar', guide: 'Range and accuracy of structures' }, { key: 'taskResponse', label: 'Task response', guide: 'Relevance and completeness of answer' }, { key: 'naturalness', label: 'Naturalness', guide: 'Natural written phrasing; not accent or pronunciation' }],
  weaknesses: ['Grammar', 'Vocabulary', 'Fluency', 'Pronunciation', 'Sentence structure'],
  conversationPrompt: 'Speak natural English. Ask one question per turn and follow up on the learner’s answer. Do not interrupt to correct mistakes. Keep replies brief.',
  evaluationPrompt: 'Evaluate transcript-based English content only: grammar, vocabulary, coherence, task response, and naturalness. Cite concrete transcript evidence. Do not score acoustic fluency or pronunciation. IELTS feedback is a practice indicator, not an official band.'
};
