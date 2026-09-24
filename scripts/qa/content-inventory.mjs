// Read-only inventory: parses literal TypeScript data without executing project code.
import ts from 'typescript';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
const output = resolve('.codex/qa/content-inventory');
const hashes = {};
async function parse(path) {
  const source = await readFile(join(root, path), 'utf8');
  hashes[path] = createHash('sha256').update(source).digest('hex');
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  assert.equal(file.parseDiagnostics.length, 0, `${path}: syntax must be valid`);
  return file;
}
function declaration(file, name) {
  let found;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      assert.equal(found, undefined, `Ambiguous declaration ${name}`); found = node.initializer;
    }
    ts.forEachChild(node, walk);
  }
  walk(file); assert.ok(found, `Missing declaration ${name}`); return found;
}
function literal(node) {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return literal(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) {
    const pairs = node.properties.map(property => {
      assert.ok(ts.isPropertyAssignment(property), 'Only explicit literal data properties are supported');
      assert.ok(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name), 'Only static property names are supported');
      return [property.name.text, literal(property.initializer)];
    });
    assert.equal(new Set(pairs.map(([key]) => key)).size, pairs.length, 'Duplicate object field');
    return Object.fromEntries(pairs);
  }
  throw new Error(`Nonliteral inventory data: ${ts.SyntaxKind[node.kind]}`);
}
const bank = literal(declaration(await parse('exams/ielts/bank.ts'), 'ieltsQuestionSets'));
const english = literal(declaration(await parse('languages/en/config.ts'), 'english'));
const japanese = literal(declaration(await parse('languages/ja/config.ts'), 'japanese'));
const scenarios = literal(declaration(await parse('lib/ai/demo.ts'), 'scenarios'));
const training = declaration(await parse('training/config.ts'), 'modes');
const modeStatus = {};
for (const property of training.properties) {
  if (ts.isPropertyAssignment(property)) modeStatus[property.name.text] = literal(property.initializer).enabled;
  else if (ts.isShorthandPropertyAssignment(property) && ['ielts', 'toefl'].includes(property.name.text)) {
    const name = property.name.text;
    modeStatus[name] = literal(declaration(await parse(`exams/${name}/config.ts`), name)).enabled;
  } else throw new Error('Unsupported training mode definition');
}
const rows = [];
const expectedFields = ['questionId', 'sourceReference', 'authorizationStatus', 'examVersion', 'targetSkills', 'contentVersion'];
function add(row) {
  assert.ok(typeof row.text === 'string' && row.text.trim(), `Empty prompt ${row.locator}`);
  rows.push({ ...row, normalizedText: row.text.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ') });
}
for (const set of bank) {
  assert.equal(set.part1.length, 4); assert.equal(set.part3.length, 3);
  for (const part of [1, 2, 3]) {
    const prompts = part === 2 ? [set.part2] : set[`part${part}`];
    prompts.forEach((text, index) => add({ locator: `exams/ielts/bank.ts#${set.id}/part${part}/${index + 1}`, language: 'en', mode: 'ielts', topic: set.theme, difficulty: set.difficulty, part, text, runtimeSelected: true, source: set.source, reviewStatus: set.reviewStatus, formalApprovalVerified: false, missingGovernance: expectedFields.filter(field => !Object.hasOwn(set, field)) }));
  }
}
for (const language of [english, japanese]) {
  for (const [mode, prompts] of Object.entries(language.fallbackQuestions)) {
    prompts.forEach((text, index) => add({ locator: `languages/${language.id}/config.ts#fallbackQuestions/${mode}/${index + 1}`, language: language.id, mode, topic: null, difficulty: null, text, runtimeSelected: Boolean(modeStatus[mode]) && mode !== 'ielts' && !(language.id === 'ja' && mode === 'scenario'), reviewStatus: 'not-recorded', formalApprovalVerified: false, missingGovernance: expectedFields.filter(field => !(field === 'examVersion' && mode !== 'ielts' && mode !== 'toefl')) }));
  }
}
for (const [topic, prompts] of Object.entries(scenarios)) {
  prompts.forEach((text, index) => add({ locator: `lib/ai/demo.ts#scenarios/${topic}/${index + 1}`, language: 'ja', mode: 'scenario', topic, difficulty: null, text, runtimeSelected: true, reviewStatus: 'not-recorded', formalApprovalVerified: false, missingGovernance: expectedFields.filter(field => field !== 'examVersion') }));
}
const groups = new Map();
for (const row of rows) {
  const key = `${row.language}:${row.normalizedText}`;
  if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row.locator);
}
const duplicates = [...groups.values()].filter(group => group.length > 1);
const coverage = [];
for (const language of [english, japanese]) {
  for (const mode of language.modes) {
    const selected = rows.filter(row => row.language === language.id && row.mode === mode && row.runtimeSelected);
    const all = rows.filter(row => row.language === language.id && row.mode === mode);
    coverage.push({ language: language.id, mode, enabled: Boolean(modeStatus[mode]), inventoryEntries: all.length, currentlySelectedEntries: selected.length, uniqueSelectedTexts: new Set(selected.map(row => row.normalizedText)).size, labelledTopics: language.topics[mode] || [], questionTopics: [...new Set(selected.map(row => row.topic).filter(Boolean))], difficultyTags: [...new Set(selected.map(row => row.difficulty).filter(Boolean))], formalApprovalVerified: 0 });
  }
}
const report = { generatedAt: new Date().toISOString(), sourceHashes: hashes, method: 'Static literal AST inventory, no runtime imports, no network, no content approval or semantic equivalence inference', auditLocatorsAreProductIds: false, entries: rows.length, uniqueTexts: groups.size, duplicateGroups: duplicates, formalApprovalVerified: 0, coverage, questions: rows.map(({ normalizedText, ...row }) => row), gaps: [
  'IELTS sets remain editorial-draft; no independent formal approval was inferred.',
  'Audit locators are not stable product question IDs; per-question governance is missing.',
  'English/Japanese daily topic choices reuse the same language-specific fallback list; topic labels do not demonstrate distinct task coverage.',
  'Daily/scenario prompts do not vary by selected proficiency level in the current selector.',
  'IELTS/TOEFL version contracts and required materials are not established by enabled flags or turn limits.',
  'Exact normalized duplicates only; semantic duplicates, language quality, copyright and pedagogy still require review.',
  'Disabled-mode fallback strings are inventory only, not functioning modules.',
] };
await mkdir(output, { recursive: true });
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const table = coverage.map(row => `| ${row.language} | ${row.mode} | ${row.enabled ? 'enabled' : 'disabled'} | ${row.inventoryEntries} | ${row.uniqueSelectedTexts} | 0 |`).join('\n');
const markdown = `# Content inventory audit\n\nThis is a read-only inventory of current source data, not approval to publish or proof of an implemented module. Generated by \`node scripts/qa/content-inventory.mjs\`. Full per-item locators, missing fields and source hashes: \`.codex/qa/content-inventory/report.json\`.\n\n| Language | Mode | Configuration | Inventory entries | Unique currently selected prompts | Verified formal approval |\n| --- | --- | --- | ---: | ---: | ---: |\n${table}\n\nTotal entries: ${rows.length}; unique normalized texts: ${groups.size}; exact duplicate groups: ${duplicates.length}. Disabled placeholders and bypassed fallback strings are included in the inventory total, but excluded from selected prompts.\n\n## Gaps\n\n${report.gaps.map(gap => '- ' + gap).join('\n')}\n\n## Next content work\n\n1. Establish immutable question IDs/versions, source references and per-question review records without promoting existing drafts to approved.\n2. Assign real topic, skill, difficulty and communication-goal coverage; current UI labels are not evidence of separate content.\n3. Have an authorized content reviewer confirm the existing original IELTS sets and required exam-version rules; generate a missing-content plan before writing new prompts.\n4. Keep daily/topic/free-talk strategies separate; do not enable disabled modes solely because a fallback string exists.\n\nThe tool does not edit question banks, download questions, call models, install dependencies or assign rights/approval. A zero approval count means no verified approval in the inspected data, not a legal determination. No production selector changed.\n`;
await writeFile(join(root, 'docs/qa/CONTENT_INVENTORY.md'), markdown);
console.log(JSON.stringify({ entries: report.entries, uniqueTexts: report.uniqueTexts, duplicateGroups: duplicates.length, formalApprovalVerified: 0, output }, null, 2));
