# Language system

To add Korean: add `languages/ko/config.ts` with language ID, display metadata, speech locale, levels, supported modes, topic/question banks, conversation/evaluation prompts, rubric and weakness labels. Extend `LanguageId` and the `languages` registry, API validation, and language selector. Do not edit the speaking reducer or duplicate the speaking UI. Add mode or exam-specific prompt/rubric modules only if the target requires them.

Rubrics are arrays of named dimensions. IELTS's examiner rules live in `exams/ielts/config.ts` and can override generic language criteria. Japanese adds naturalness and appropriateness; pronunciation is omitted from text-only AI scoring. Level references such as N4 indicate difficulty, never official JLPT speaking scores.
