/**
 * Check the curriculum's hard numbers against a single canonical registry.
 *
 * The failure this exists to catch is not a wrong number in isolation — it is
 * the SAME number stated two different ways in two topics, which is the most
 * common defect in study material and the hardest to notice by reading.
 *
 * Two checks run:
 *   1. Derived ratios. facts.json states absolute latencies; prose states
 *      ratios between them ("memory is ~100x faster than SSD"). The ratio is
 *      computed from the canonical values and compared to what prose claims,
 *      so the two can never drift apart silently.
 *   2. Traceability. Every fact must cite a url that is in the reading list,
 *      so no canonical number is self-asserted.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const FACTS = path.join(ROOT, 'content', 'facts.json');
const CURRICULUM = path.join(ROOT, 'content', 'curriculum.json');
const READING = path.join(ROOT, 'content', 'reading-list.json');
const CODE_DIR = path.join(ROOT, 'content', 'code');

/** Everything normalises to nanoseconds so ratios are unit-agnostic. */
const TO_NS: Record<string, number> = {
  ns: 1,
  us: 1e3,
  ms: 1e6,
  s: 1e9,
  minutes: 60e9,
  hours: 3600e9,
};

const WORD_NUMBERS: Record<string, number> = {
  'a hundred': 100,
  'a thousand': 1000,
};

interface Fact {
  id: string;
  label: string;
  value: number;
  unit: string;
  source: string;
  lastVerified: string;
}
interface Derived {
  id: string;
  description: string;
  slower: string;
  faster: string;
  patterns: string[];
}

interface Doc {
  where: string;
  text: string;
}

function loadDocs(): Doc[] {
  const docs: Doc[] = [];

  const curriculum = JSON.parse(fs.readFileSync(CURRICULUM, 'utf-8')) as {
    topics: { slug: string; sections: { slug: string; contentMarkdown: string }[] }[];
  };
  for (const t of curriculum.topics) {
    for (const s of t.sections ?? []) {
      docs.push({ where: `${t.slug}/${s.slug}`, text: s.contentMarkdown ?? '' });
    }
  }

  if (fs.existsSync(CODE_DIR)) {
    for (const dir of fs.readdirSync(CODE_DIR)) {
      const dirPath = path.join(CODE_DIR, dir);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      for (const file of fs.readdirSync(dirPath)) {
        if (!file.endsWith('.json')) continue;
        const spec = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf-8')) as {
          steps: { code?: string; explain: string }[];
        };
        const text = spec.steps.map((s) => `${s.code ?? ''}\n${s.explain}`).join('\n');
        docs.push({ where: `content/code/${dir}/${file}`, text });
      }
    }
  }

  return docs;
}

/** Order-of-magnitude claims are approximate by nature, so only flag a claim
 *  that is off by more than 3x — which is enough to catch a factor-of-ten slip
 *  without arguing about whether 1000 should have been written as 1500. */
function ratioMismatch(claimed: number, actual: number): boolean {
  const ratio = claimed > actual ? claimed / actual : actual / claimed;
  return ratio > 3;
}

function main(): void {
  const registry = JSON.parse(fs.readFileSync(FACTS, 'utf-8')) as {
    facts: Fact[];
    derived: Derived[];
  };
  const byId = new Map(registry.facts.map((f) => [f.id, f]));
  const errors: string[] = [];

  // --- 1. every canonical number must be traceable to a curated source
  if (fs.existsSync(READING)) {
    const reading = JSON.parse(fs.readFileSync(READING, 'utf-8')) as {
      entries: { url: string }[];
    };
    const urls = new Set(reading.entries.map((e) => e.url));
    for (const f of registry.facts) {
      if (!urls.has(f.source)) {
        errors.push(`fact "${f.id}": source is not in the reading list — ${f.source}`);
      }
    }
  }

  for (const f of registry.facts) {
    if (!(f.unit in TO_NS)) errors.push(`fact "${f.id}": unknown unit "${f.unit}"`);
  }

  // --- 2. prose ratios must match the ratio implied by the canonical values
  const docs = loadDocs();
  let claimsChecked = 0;

  for (const d of registry.derived) {
    const slow = byId.get(d.slower);
    const fast = byId.get(d.faster);
    if (!slow || !fast) {
      errors.push(`derived "${d.id}": references an unknown fact id`);
      continue;
    }
    const actual = (slow.value * TO_NS[slow.unit]) / (fast.value * TO_NS[fast.unit]);

    for (const raw of d.patterns) {
      const re = new RegExp(raw, 'gi');
      for (const doc of docs) {
        for (const m of doc.text.matchAll(re)) {
          claimsChecked++;
          const token = m[1].toLowerCase().replace(/,/g, '');
          const claimed = WORD_NUMBERS[token] ?? Number(token);
          if (Number.isNaN(claimed)) continue;

          if (ratioMismatch(claimed, actual)) {
            errors.push(
              `${doc.where}: claims ${slow.label} is ${m[1]}x slower than ${fast.label}, ` +
                `but facts.json implies ${Math.round(actual)}x — "${m[0].trim()}"`,
            );
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    console.log('FAIL content/facts.json');
    for (const e of errors) console.log(`  • ${e}`);
    process.exit(1);
  }

  console.log(
    `facts registry valid: ${registry.facts.length} canonical figures, ` +
      `${claimsChecked} prose claim(s) cross-checked across ${docs.length} documents.`,
  );
}

main();
