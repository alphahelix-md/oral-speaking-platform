# IELTS practice question audit

Reviewed 2026-09-17.

The referenced [IELTS-Speaking-AI question bank](https://github.com/1599570912/IELTS-Speaking-AI/blob/main/ielts-question-bank.js) groups prompts by part and topic. Its repository carries an MIT licence, but that file provides no per-question origin or evidence that the prompts are official exam items. Its README's “210+” claim was not used as an import count. No prompts or code from that bank were copied.

The [IELTS Speaking format](https://ielts.org/organisations/ielts-for-organisations/test-types/ielts-academic-test) informed the review criteria: Part 1 asks about familiar life, Part 2 is an extended personal account with cue points, and Part 3 discusses broader issues linked to Part 2. Oral's current practice is not a timed official mock.

Imported into Oral: 5 original sets × (4 Part 1 + 1 Part 2 + 3 Part 3) = 40 prompts. Every item in `bank.ts` inherits its set's topic, estimated difficulty, source, review status, date and reviewer metadata. Codex performed an editorial draft review; no human examiner has certified the items. Checks: readable English, one main question or cue per item, no personal identifier request, no claim of being a past paper, and thematic Part 2–3 linkage.

Future imports must record item origin, licence/permission, reviewer, and date before activation.
