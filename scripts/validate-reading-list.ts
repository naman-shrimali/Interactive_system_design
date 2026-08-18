/**
 * Validate the curated reading list.
 *
 * Structure is checked always; URLs are only fetched with --check-links, since
 * that hits the network and is meant for CI and periodic re-verification rather
 * than every local run.
 */
import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

const ROOT = path.join(__dirname, '..');
const LIST = path.join(ROOT, 'content', 'reading-list.json');
const TOPIC_MAP = path.join(ROOT, 'content', 'topic-map.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'reading-list.schema.json'), 'utf-8'),
);

interface Entry {
  url: string;
  title: string;
  kind: string;
  tier: string;
  topics: string[];
  why: string;
  lastVerified: string;
}

const KNOWN_TOPICS: Set<string> = new Set(
  (JSON.parse(fs.readFileSync(TOPIC_MAP, 'utf-8')).topics as { slug: string }[]).map((t) => t.slug),
);

function structural(entries: Entry[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, number>();
  const today = new Date().toISOString().slice(0, 10);

  entries.forEach((e, i) => {
    const at = `entry ${i + 1} ("${e.title}")`;

    const dup = seen.get(e.url);
    if (dup !== undefined) errors.push(`${at}: duplicate url, already used by entry ${dup + 1}`);
    seen.set(e.url, i);

    for (const slug of e.topics) {
      if (!KNOWN_TOPICS.has(slug)) errors.push(`${at}: unknown topic "${slug}"`);
    }
    if (new Set(e.topics).size !== e.topics.length) errors.push(`${at}: repeated topic slug`);

    // A future verification date means someone typed a date they did not check.
    if (e.lastVerified > today) errors.push(`${at}: lastVerified "${e.lastVerified}" is in the future`);

    // "why" should say what the source settles, not restate the title.
    if (e.why.toLowerCase().includes(e.title.toLowerCase())) {
      errors.push(`${at}: "why" restates the title instead of explaining what it settles`);
    }
  });

  return errors;
}

/**
 * A publisher refusing our user-agent is not a dead link. Treating 403/405/429
 * as failures would make this job cry wolf, and a link checker nobody trusts is
 * worse than none — so those are reported as warnings and only 404/410/5xx fail.
 */
const BLOCKED = new Set([401, 403, 405, 429]);

async function checkLinks(entries: Entry[]): Promise<{ errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Sequential and slow on purpose — this is a politeness-bound job, not a race.
  for (const e of entries) {
    let status = 0;
    try {
      const res = await fetch(e.url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'user-agent': 'isd-reading-list-checker' },
        signal: AbortSignal.timeout(20_000),
      });
      status = res.status;
    } catch (err) {
      errors.push(`${e.url} — request failed (${(err as Error).message})`);
      console.log(`  FAIL ${e.url}`);
      continue;
    }

    if (BLOCKED.has(status)) {
      warnings.push(`${e.url} — HTTP ${status} (bot-blocked; verify by hand)`);
    } else if (status >= 400) {
      errors.push(`${e.url} — HTTP ${status}`);
    }
    console.log(`  ${status === 200 ? 'ok  ' : String(status).padEnd(4)} ${e.url}`);
  }

  return { errors, warnings };
}

async function main(): Promise<void> {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(SCHEMA);
  const data = JSON.parse(fs.readFileSync(LIST, 'utf-8')) as { entries: Entry[] };

  const errors: string[] = [];
  if (!validate(data)) {
    for (const err of validate.errors ?? []) errors.push(`${err.instancePath || '/'} ${err.message}`);
  }
  errors.push(...structural(data.entries));

  const warnings: string[] = [];
  if (process.argv.includes('--check-links')) {
    console.log(`Checking ${data.entries.length} links…`);
    const res = await checkLinks(data.entries);
    errors.push(...res.errors);
    warnings.push(...res.warnings);
  }

  if (warnings.length > 0) {
    console.log(`\n${warnings.length} link(s) could not be auto-verified:`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  if (errors.length > 0) {
    console.log(`\nFAIL content/reading-list.json`);
    for (const e of errors) console.log(`  • ${e}`);
    process.exit(1);
  }

  const topics = new Set(data.entries.flatMap((e) => e.topics));
  console.log(
    `\nreading list valid: ${data.entries.length} entries covering ${topics.size} of ${KNOWN_TOPICS.size} topics.`,
  );
}

void main();
