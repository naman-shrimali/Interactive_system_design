/** Validate hand-authored code-walkthrough JSON against the schema + cross-reference rules. */
import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

const ROOT = path.join(__dirname, '..');
const CODE_DIR = path.join(ROOT, 'content', 'code');
const TOPIC_MAP = path.join(ROOT, 'content', 'topic-map.json');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, 'code-walkthrough.schema.json'), 'utf-8'));

/** Walkthrough directories are named for the topic that owns them. */
const KNOWN_TOPICS: Set<string> = fs.existsSync(TOPIC_MAP)
  ? new Set(
      (JSON.parse(fs.readFileSync(TOPIC_MAP, 'utf-8')).topics as { slug: string }[]).map((t) => t.slug),
    )
  : new Set();

const ajv = new Ajv({ allErrors: true, useDefaults: false });
const validate = ajv.compile(SCHEMA);

interface Step {
  title: string;
  kind: 'code' | 'infra';
  code?: string;
  explain: string;
}
interface Spec {
  id: string;
  title: string;
  steps: Step[];
}

function crossCheck(spec: Spec, fileBase: string): string[] {
  const errors: string[] = [];

  if (spec.id !== fileBase) {
    errors.push(`spec id "${spec.id}" must equal the filename "${fileBase}"`);
  }

  spec.steps.forEach((s, i) => {
    const at = `step ${i + 1} ("${s.title}")`;

    // The whole point of an infra step is the one-line explanation, so make it earn its place.
    if (s.kind === 'infra' && s.explain.trim().length < 40) {
      errors.push(`${at}: infra steps need a real explanation of what happens here, not a stub`);
    }
    if (s.kind === 'code') {
      if (!s.code || s.code.trim() === '') errors.push(`${at}: code step has empty code`);
      // A snippet nobody can read on a phone is not a whiteboard dry run.
      const longest = (s.code ?? '').split('\n').reduce((m, l) => Math.max(m, l.length), 0);
      if (longest > 100) errors.push(`${at}: line of ${longest} chars — keep snippets under 100 cols`);
      const lines = (s.code ?? '').split('\n').length;
      if (lines > 40) errors.push(`${at}: ${lines} lines — split it; a dry-run step should be scannable`);
    }
    // "explain" is meant to be what you SAY, not a restatement of the code.
    if (s.explain.trim().length < 30) errors.push(`${at}: explain is too thin to be useful`);
  });

  return errors;
}

function main(): void {
  if (!fs.existsSync(CODE_DIR)) {
    console.log('no code walkthroughs found');
    return;
  }

  let failed = 0;
  let count = 0;

  for (const dir of fs.readdirSync(CODE_DIR).sort()) {
    const dirPath = path.join(CODE_DIR, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    for (const file of fs.readdirSync(dirPath).sort()) {
      if (!file.endsWith('.json')) continue;
      count++;
      const rel = `${dir}/${file}`;
      const errors: string[] = [];

      if (KNOWN_TOPICS.size > 0 && !KNOWN_TOPICS.has(dir)) {
        errors.push(`directory "${dir}" is not a topic slug in content/topic-map.json`);
      }

      let spec: Spec | null = null;
      try {
        spec = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf-8')) as Spec;
      } catch (e) {
        errors.push(`invalid JSON: ${(e as Error).message}`);
      }

      if (spec) {
        if (!validate(spec)) {
          for (const err of validate.errors ?? []) {
            errors.push(`${err.instancePath || '/'} ${err.message}`);
          }
        }
        errors.push(...crossCheck(spec, file.replace(/\.json$/, '')));
      }

      if (errors.length > 0) {
        failed++;
        console.log(`FAIL ${rel}`);
        for (const e of errors) console.log(`       • ${e}`);
      } else {
        console.log(`OK   ${rel}`);
      }
    }
  }

  if (failed > 0) {
    console.log(`\n${failed}/${count} code walkthrough(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\nAll ${count} code walkthrough(s) valid.`);
}

main();
