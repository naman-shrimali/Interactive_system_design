/**
 * Validate every scenario by running it.
 *
 * Scenarios are TypeScript, not JSON, because executing a model is what makes
 * their numbers right by construction. That gives up the safety a schema
 * provided, so this script takes it back: it runs each scenario under every
 * knob combination and checks what came out.
 *
 *   anchors      every highlighted line contains its anchor text
 *   determinism  two runs with the same knobs produce identical frames
 *   references   nodes, edges and packets refer to things on the stage
 *   checkpoints  predict answers are valid options; sources are curated
 *   tokens       every chip names a real node, has a unique id, and fits inside its node
 *   coverage     every drawn edge carries a packet in some run
 *   facts        no latency literal (ms / µs / ns) in a scenario's text —
 *                timings come from content/facts.json via factMs()
 */
import fs from 'fs';
import path from 'path';
import { SCENARIOS } from '../client/src/sim/registry';
import type { Frame, Knob, KnobValues, Scenario } from '../client/src/sim/types';
import { tokenBoxes } from '../client/src/sim/layout';

const ROOT = path.join(__dirname, '..');
const SCEN_DIR = path.join(ROOT, 'client', 'src', 'sim', 'scenarios');
const TOPICS = new Set(
  (JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'topic-map.json'), 'utf-8')).topics as { slug: string }[]).map(
    (t) => t.slug,
  ),
);
const SOURCES = new Set(
  (JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'reading-list.json'), 'utf-8')).entries as { url: string }[]).map(
    (e) => e.url,
  ),
);

const MAX_SAY = 320;

function combos(knobs: Knob[]): KnobValues[] {
  let out: KnobValues[] = [{}];
  for (const k of knobs) {
    const values = k.kind === 'toggle' ? [false, true] : k.options.map((o) => o.value);
    out = out.flatMap((c) => values.map((v) => ({ ...c, [k.id]: v })));
  }
  return out;
}

function checkRun(s: Scenario, k: KnobValues, frames: Frame[], errors: string[], usedEdges: Set<string>): void {
  const tag = `[${Object.entries(k).map(([a, b]) => `${a}=${b}`).join(' ') || 'defaults'}]`;
  const src = s.source(k);
  const nodeIds = new Set(s.stage.nodes.map((n) => n.id));
  const edgeIds = new Set(s.stage.edges.map((e) => e.id));
  const knobIds = new Map(s.knobs.map((x) => [x.id, x]));

  if (frames.length < 3) errors.push(`${tag} only ${frames.length} frames`);

  let lastT = -Infinity;
  frames.forEach((f, i) => {
    const at = `${tag} step ${i + 1}`;

    if (f.t < lastT) errors.push(`${at}: clock went backwards (${lastT} → ${f.t})`);
    lastT = f.t;

    if (!f.say.trim()) errors.push(`${at}: empty narration`);
    if (f.say.length > MAX_SAY) errors.push(`${at}: narration is ${f.say.length} chars — keep "say" to one sentence; move reasoning to "why"`);

    if (f.line) {
      const line = src[f.line.n - 1];
      if (line === undefined) errors.push(`${at}: line ${f.line.n} is past the end of the source (${src.length} lines)`);
      else if (!line.includes(f.line.anchor)) {
        errors.push(`${at}: line ${f.line.n} should contain "${f.line.anchor}" but reads: ${line.trim()}`);
      }
    }

    for (const id of Object.keys(f.nodes)) if (!nodeIds.has(id)) errors.push(`${at}: state for unknown node "${id}"`);
    for (const id of Object.keys(f.links ?? {})) if (!edgeIds.has(id)) errors.push(`${at}: link state for unknown edge "${id}"`);
    for (const p of f.packets ?? []) {
      if (!edgeIds.has(p.edge)) errors.push(`${at}: packet on unknown edge "${p.edge}"`);
      else usedEdges.add(p.edge);
    }

    if (f.tokens?.length) {
      const ids = new Set<string>();
      for (const t of f.tokens) {
        if (ids.has(t.id)) errors.push(`${at}: token id "${t.id}" appears twice`);
        ids.add(t.id);
        if (!nodeIds.has(t.node)) errors.push(`${at}: token "${t.id}" in unknown node "${t.node}"`);
      }
      const boxes = tokenBoxes(s.stage, f.tokens, f.nodes);
      for (const [id, b] of Object.entries(boxes)) {
        const n = s.stage.nodes.find((x) => x.id === b.node)!;
        if (b.x + b.w > n.x + n.w - 6 || b.y + b.h > n.y + n.h - 6) {
          errors.push(`${at}: token "${id}" spills out of node "${n.id}" — make the node bigger or the labels shorter`);
        }
      }
    }

    const cp = f.checkpoint;
    if (cp) {
      if (cp.source && !SOURCES.has(cp.source.url)) errors.push(`${at}: checkpoint source is not in the reading list — ${cp.source.url}`);
      if (cp.reveal.trim().split(/\s+/).length < 20) errors.push(`${at}: checkpoint reveal is too thin to explain why`);
      if (cp.kind === 'predict') {
        if (cp.options.length < 2) errors.push(`${at}: a prediction needs at least two options`);
        if (!Number.isInteger(cp.answer) || cp.answer < 0 || cp.answer >= cp.options.length) {
          errors.push(`${at}: predict answer ${cp.answer} is not one of the ${cp.options.length} options`);
        }
      }
      if (cp.kind === 'break' && cp.knob) {
        const knob = knobIds.get(cp.knob.id);
        if (!knob) errors.push(`${at}: checkpoint offers unknown knob "${cp.knob.id}"`);
        else if (knob.kind === 'toggle' && typeof cp.knob.value !== 'boolean') errors.push(`${at}: toggle knob needs a boolean`);
        else if (knob.kind === 'choice' && !knob.options.some((o) => o.value === cp.knob!.value)) {
          errors.push(`${at}: "${cp.knob.value}" is not an option of knob "${cp.knob.id}"`);
        }
      }
    }
  });

  if (!frames.some((f) => f.checkpoint?.kind === 'predict')) errors.push(`${tag} no predict checkpoint — ask before you show`);
  if (!frames.some((f) => f.checkpoint && f.checkpoint.kind !== 'predict')) errors.push(`${tag} no why/break checkpoint`);
}

/** Latency literals belong in content/facts.json. Lines marked `fact-exempt`
 *  (a hypothetical figure, not a property of hardware) are skipped. */
function lintLiterals(s: Scenario, errors: string[]): void {
  const file = fs.readdirSync(SCEN_DIR).find((f) => {
    const text = fs.readFileSync(path.join(SCEN_DIR, f), 'utf-8');
    return text.includes(`id: '${s.id}'`);
  });
  if (!file) {
    errors.push(`could not find the source file for scenario "${s.id}"`);
    return;
  }
  const lines = fs.readFileSync(path.join(SCEN_DIR, file), 'utf-8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('fact-exempt') || /^\s*(\/\/|\*|\/\*)/.test(line)) return;
    const strings = line.match(/'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"/g) ?? [];
    for (const str of strings) {
      const m = str.match(/\b\d+(?:\.\d+)?\s?(?:ms|µs|us|ns)\b/);
      if (m) errors.push(`${file}:${i + 1}: latency literal "${m[0]}" — take it from facts.json with factMs()`);
    }
  });
}

function main(): void {
  let failed = 0;
  const ids = new Set<string>();

  for (const s of SCENARIOS) {
    const errors: string[] = [];

    if (ids.has(s.id)) errors.push(`duplicate scenario id "${s.id}"`);
    ids.add(s.id);
    if (!TOPICS.has(s.topic)) errors.push(`unknown topic "${s.topic}"`);

    const nodeIds = new Set<string>();
    for (const n of s.stage.nodes) {
      if (nodeIds.has(n.id)) errors.push(`duplicate node "${n.id}"`);
      nodeIds.add(n.id);
      if (n.x < 0 || n.y < 0 || n.x + n.w > s.stage.width || n.y + n.h > s.stage.height) {
        errors.push(`node "${n.id}" is outside the ${s.stage.width}×${s.stage.height} stage`);
      }
    }
    for (const e of s.stage.edges) {
      if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) errors.push(`edge "${e.id}" joins an unknown node`);
    }

    const usedEdges = new Set<string>();
    let runs = 0;
    for (const k of combos(s.knobs)) {
      const a = s.run(k);
      const b = s.run(k);
      runs++;
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        errors.push(`[${JSON.stringify(k)}] not deterministic — use the seeded rng from sim/rng.ts`);
      }
      checkRun(s, k, a, errors, usedEdges);
    }
    for (const e of s.stage.edges) {
      if (!usedEdges.has(e.id)) errors.push(`edge "${e.id}" is drawn but no packet ever travels it`);
    }

    lintLiterals(s, errors);

    const unique = [...new Set(errors)];
    if (unique.length) {
      failed++;
      console.log(`FAIL ${s.id}`);
      for (const e of unique) console.log(`       • ${e}`);
    } else {
      const frames = s.run(Object.fromEntries(s.knobs.map((k) => [k.id, k.default])));
      console.log(`OK   ${s.id}  (${runs} knob combinations, ${frames.length} steps by default)`);
    }
  }

  if (failed) {
    console.log(`\n${failed}/${SCENARIOS.length} scenario(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\nAll ${SCENARIOS.length} scenario(s) valid.`);
}

main();
