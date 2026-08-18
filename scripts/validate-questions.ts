/**
 * Validate the questions / misconceptions / traps content.
 *
 * The rules that matter are the ones keeping the three kinds honest: a
 * misconception must be stated as the belief someone actually holds (not as a
 * question), a question must actually ask something, and any entry that
 * corrects a factual claim must cite a source already in the reading list.
 */
import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'content', 'questions.json');
const READING = path.join(ROOT, 'content', 'reading-list.json');
const TOPIC_MAP = path.join(ROOT, 'content', 'topic-map.json');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.schema.json'), 'utf-8'));

interface Entry {
  topic: string;
  kind: 'question' | 'misconception' | 'trap';
  prompt: string;
  answer: string;
  source?: string;
  followUp?: string;
}

const KNOWN_TOPICS = new Set(
  (JSON.parse(fs.readFileSync(TOPIC_MAP, 'utf-8')).topics as { slug: string }[]).map((t) => t.slug),
);
const SOURCES = new Set(
  (JSON.parse(fs.readFileSync(READING, 'utf-8')).entries as { url: string }[]).map((e) => e.url),
);

function crossCheck(entries: Entry[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, number>();

  entries.forEach((e, i) => {
    const at = `entry ${i + 1} (${e.topic}, ${e.kind})`;

    if (!KNOWN_TOPICS.has(e.topic)) errors.push(`${at}: unknown topic "${e.topic}"`);

    const key = e.prompt.trim().toLowerCase();
    const dup = seen.get(key);
    if (dup !== undefined) errors.push(`${at}: duplicate prompt, already used by entry ${dup + 1}`);
    seen.set(key, i);

    // A correction is only worth trusting if you can follow it to a source.
    if (e.source && !SOURCES.has(e.source)) {
      errors.push(`${at}: source is not in the reading list — ${e.source}`);
    }

    // Keep the three kinds distinct, or the format collapses into a blob.
    const asksSomething = e.prompt.trim().endsWith('?');
    if (e.kind === 'question' && !asksSomething) {
      errors.push(`${at}: a question's prompt should actually ask something`);
    }
    if (e.kind === 'misconception' && asksSomething) {
      errors.push(
        `${at}: state the wrong belief as someone would assert it, not as a question — ` +
          `otherwise it is a "question", not a misconception`,
      );
    }

    // The answer has to do more than contradict the prompt.
    if (e.answer.trim().split(/\s+/).length < 25) {
      errors.push(`${at}: answer is too thin to explain why`);
    }
  });

  return errors;
}

function main(): void {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(SCHEMA);
  const data = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as { entries: Entry[] };

  const errors: string[] = [];
  if (!validate(data)) {
    for (const err of validate.errors ?? []) errors.push(`${err.instancePath || '/'} ${err.message}`);
  }
  errors.push(...crossCheck(data.entries));

  if (errors.length > 0) {
    console.log('FAIL content/questions.json');
    for (const e of errors) console.log(`  • ${e}`);
    process.exit(1);
  }

  const byKind = data.entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1;
    return acc;
  }, {});
  const topics = new Set(data.entries.map((e) => e.topic));

  console.log(
    `questions valid: ${data.entries.length} entries across ${topics.size} of ${KNOWN_TOPICS.size} topics ` +
      `(${byKind.question ?? 0} questions, ${byKind.misconception ?? 0} misconceptions, ${byKind.trap ?? 0} traps).`,
  );
}

main();
