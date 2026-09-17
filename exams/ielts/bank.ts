export type IeltsQuestionSet = {
  id: string;
  theme: string;
  source: 'original';
  difficulty: 'intermediate' | 'upper-intermediate';
  reviewStatus: 'editorial-draft';
  reviewedOn: string;
  reviewedBy: 'Codex editorial draft';
  part1: readonly [string, string, string, string];
  part2: string;
  part3: readonly [string, string, string];
};

// Practice prompts authored for Oral. These are not official IELTS test items.
// Every set links the Part 2 cue to its Part 3 discussion questions.
export const ieltsQuestionSets: readonly IeltsQuestionSet[] = [
  {
    id: 'community',
    theme: 'Neighbourhood and community',
    source: 'original',
    difficulty: 'intermediate',
    reviewStatus: 'editorial-draft',
    reviewedOn: '2026-09-17',
    reviewedBy: 'Codex editorial draft',
    part1: [
      'What do you like most about the area where you live?',
      'Is there a public place near your home that you visit often?',
      'How do you usually travel around your neighbourhood?',
      'Have you attended any local events recently?',
    ],
    part2: 'Describe a public place in your area that people enjoy. Say where it is, what people do there, when you first visited it, and explain why it is important to the community.',
    part3: [
      'How can public spaces help people feel connected to their community?',
      'What should local governments consider when they build new public spaces?',
      'Can online communities offer the same benefits as meeting in person?',
    ],
  },
  {
    id: 'learning',
    theme: 'Learning and skills',
    source: 'original',
    difficulty: 'intermediate',
    reviewStatus: 'editorial-draft',
    reviewedOn: '2026-09-17',
    reviewedBy: 'Codex editorial draft',
    part1: [
      'What subject did you enjoy most at school?',
      'Do you prefer learning by yourself or with other people?',
      'What is something new you have learned recently?',
      'Do you use any apps or websites to help you study?',
    ],
    part2: 'Describe a skill you learned outside a formal class. Say what the skill is, how you learned it, what was difficult at first, and explain how you use it now.',
    part3: [
      'Why do some adults continue learning after they leave school?',
      'Which skills are better learned through practice than through textbooks?',
      'How can communities make learning opportunities more accessible?',
    ],
  },
  {
    id: 'travel',
    theme: 'Travel and culture',
    source: 'original',
    difficulty: 'intermediate',
    reviewStatus: 'editorial-draft',
    reviewedOn: '2026-09-17',
    reviewedBy: 'Codex editorial draft',
    part1: [
      'Do you enjoy taking short trips?',
      'How do you usually plan a visit to a new place?',
      'Which type of transport do you prefer for longer journeys?',
      'Is there a place you would like to visit again?',
    ],
    part2: 'Describe a journey that helped you understand a place better. Say where you went, who you travelled with, what you did there, and explain what you learned from the experience.',
    part3: [
      'How can tourism benefit people who live in a destination?',
      'What problems can arise when a place receives too many visitors?',
      'How might travel help people understand cultures different from their own?',
    ],
  },
  {
    id: 'technology',
    theme: 'Technology and communication',
    source: 'original',
    difficulty: 'upper-intermediate',
    reviewStatus: 'editorial-draft',
    reviewedOn: '2026-09-17',
    reviewedBy: 'Codex editorial draft',
    part1: [
      'What device do you use most often during the day?',
      'Do you usually prefer calling or messaging your friends?',
      'Was it easy for you to learn to use your newest device?',
      'Do you ever choose to spend time away from screens?',
    ],
    part2: 'Describe a time when technology helped you solve a problem. Say what the problem was, which technology you used, what happened, and explain whether you would use it again.',
    part3: [
      'How have digital services changed the way people solve everyday problems?',
      'What can be done for people who struggle to access digital services?',
      'When might relying on technology create new difficulties?',
    ],
  },
  {
    id: 'environment',
    theme: 'Daily habits and the environment',
    source: 'original',
    difficulty: 'upper-intermediate',
    reviewStatus: 'editorial-draft',
    reviewedOn: '2026-09-17',
    reviewedBy: 'Codex editorial draft',
    part1: [
      'Do you spend much time outdoors?',
      'What kind of weather do you enjoy most?',
      'Do you try to reduce waste in your daily life?',
      'Is locally produced food popular where you live?',
    ],
    part2: 'Describe a change you made to an everyday habit to reduce waste. Say what you changed, why you decided to do it, what was difficult, and explain the effect it has had.',
    part3: [
      'Who should take the greatest responsibility for reducing household waste?',
      'How can city design make environmentally friendly choices easier?',
      'Why might some people find sustainable products difficult to buy?',
    ],
  },
];

export function ieltsQuestionSet(id?: string): IeltsQuestionSet {
  return ieltsQuestionSets.find(set => set.id === id) || ieltsQuestionSets[0];
}
