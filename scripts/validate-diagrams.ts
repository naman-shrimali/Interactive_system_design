/** TASK-009: Validate hand-authored diagram JSON against the schema + cross-reference rules. */
import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';
import { diagramStage, footprint } from '../client/src/sim/fromDiagram';
import { edgeGeometry, regionLabelBox, routeCrosses } from '../client/src/sim/layout';
import type { InteractiveDiagram } from '../client/src/types';

const ROOT = path.join(__dirname, '..');
const DIAGRAMS_DIR = path.join(ROOT, 'content', 'diagrams');
const TOPIC_MAP = path.join(ROOT, 'content', 'topic-map.json');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, 'diagram.schema.json'), 'utf-8'));

/** Diagram directories are named for the topic that owns them. */
const KNOWN_TOPICS: Set<string> = fs.existsSync(TOPIC_MAP)
  ? new Set(
      (JSON.parse(fs.readFileSync(TOPIC_MAP, 'utf-8')).topics as { slug: string }[]).map(
        (t) => t.slug,
      ),
    )
  : new Set();

const ajv = new Ajv({ allErrors: true, useDefaults: false });
const validate = ajv.compile(SCHEMA);

const SOURCE_HANDLES = new Set(['bottom', 'right', 'top']);
const TARGET_HANDLES = new Set(['top', 'left', 'bottom']);

interface Spec {
  id: string;
  nodes: { id: string; type: string; groupId?: string; tableData?: unknown }[];
  edges: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }[];
  groups?: { id: string }[];
  flows?: { id: string; steps: { edgeIds: string[] }[] }[];
}

function crossCheck(spec: Spec, fileBase: string): string[] {
  const errors: string[] = [];
  const dupe = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`duplicate ${label} id: ${id}`);
      seen.add(id);
    }
    return seen;
  };
  const nodeIds = dupe('node', spec.nodes.map((n) => n.id));
  const groupIds = dupe('group', (spec.groups ?? []).map((g) => g.id));
  const edgeIds = dupe('edge', spec.edges.map((e) => e.id));
  dupe('flow', (spec.flows ?? []).map((f) => f.id));

  for (const n of spec.nodes) {
    if (n.groupId && !groupIds.has(n.groupId)) errors.push(`node ${n.id}: groupId "${n.groupId}" not found`);
    if (n.type === 'table' && n.tableData === undefined) errors.push(`node ${n.id}: type "table" requires tableData`);
    if (n.type !== 'table' && n.tableData !== undefined) errors.push(`node ${n.id}: tableData only allowed on type "table"`);
  }
  for (const e of spec.edges) {
    if (!nodeIds.has(e.source)) errors.push(`edge ${e.id}: source "${e.source}" not a node`);
    if (!nodeIds.has(e.target)) errors.push(`edge ${e.id}: target "${e.target}" not a node`);
    // Leaving from the top is for upward edges only: it must enter a bottom.
    if ((e.sourceHandle === 'top') !== (e.targetHandle === 'bottom')) {
      errors.push(`edge ${e.id}: an upward edge pairs sourceHandle "top" with targetHandle "bottom"`);
    }
    if (e.sourceHandle && !SOURCE_HANDLES.has(e.sourceHandle)) errors.push(`edge ${e.id}: sourceHandle must be bottom, right or top`);
    if (e.targetHandle && !TARGET_HANDLES.has(e.targetHandle)) errors.push(`edge ${e.id}: targetHandle must be top, left or bottom`);
  }
  for (const f of spec.flows ?? []) {
    for (const [i, step] of f.steps.entries()) {
      for (const eid of step.edgeIds) {
        if (!edgeIds.has(eid)) errors.push(`flow ${f.id} step ${i}: edgeId "${eid}" not found`);
      }
    }
  }
  if (spec.id !== fileBase) errors.push(`spec.id "${spec.id}" must equal filename "${fileBase}"`);
  return errors;
}

type Box = { x: number; y: number; w: number; h: number };
const hit = (a: Box, b: Box, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/**
 * Layout, as the player will actually draw it: boxes sized by the same code
 * the renderer uses (client/src/sim/layout.ts). Catches what a schema can't —
 * two boxes drawn on top of each other, a node spilling out of its tier, a
 * label printed over a component.
 */
function layoutCheck(spec: InteractiveDiagram): string[] {
  const errors: string[] = [];
  const stage = diagramStage(spec);
  const fp = new Map(stage.nodes.map((n) => [n.id, footprint(n)]));
  const ids = stage.nodes.map((n) => n.id);

  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      if (hit(fp.get(ids[i])!, fp.get(ids[j])!, 6)) errors.push(`layout: "${ids[i]}" and "${ids[j]}" overlap (or sit under 6px apart)`);

  const regionOf = new Map((spec.groups ?? []).map((g, k) => [g.id, stage.regions![k]]));
  for (const n of spec.nodes) {
    if (!n.groupId) continue;
    const r = regionOf.get(n.groupId)!;
    const b = fp.get(n.id)!;
    if (b.x < r.x || b.y < r.y || b.x + b.w > r.x + r.w! || b.y + b.h > r.y + r.h!) {
      errors.push(`layout: "${n.id}" spills out of group "${n.groupId}"`);
    }
  }

  const geom = edgeGeometry(stage);
  const placed: { id: string; box: Box }[] = [];
  for (const e of stage.edges) {
    const body = new Map(stage.nodes.map((n) => [n.id, { x: n.x, y: n.y, w: n.w, h: n.h }]));
    for (const id of ids) {
      // Its own endpoints too — measured against the box itself, since arrows
      // legitimately end inside the margin a marker or stacked ghost adds.
      const own = id === e.from || id === e.to;
      if (routeCrosses(geom[e.id], own ? body.get(id)! : fp.get(id)!)) errors.push(`layout: edge "${e.id}" runs through node "${id}"`);
    }
    const box = e.labelBox;
    if (!box) continue;
    for (const id of ids) if (hit(box, fp.get(id)!)) errors.push(`layout: label of edge "${e.id}" is drawn over node "${id}"`);
    for (const o of placed) if (hit(box, o.box, 2)) errors.push(`layout: labels of edges "${o.id}" and "${e.id}" collide`);
    placed.push({ id: e.id, box });
  }

  // Two edges drawn along the same line read as one.
  type P = [number, number];
  const segs = (pts: P[]) => pts.slice(1).map((b, i) => [pts[i], b] as [P, P]);
  for (let i = 0; i < stage.edges.length; i++)
    for (let j = i + 1; j < stage.edges.length; j++) {
      const a = stage.edges[i];
      const b = stage.edges[j];
      const shared = segs(geom[a.id] as P[]).some(([p0, p1]) =>
        segs(geom[b.id] as P[]).some(([q0, q1]) => {
          const vert = Math.abs(p0[0] - p1[0]) < 0.5 && Math.abs(q0[0] - q1[0]) < 0.5 && Math.abs(p0[0] - q0[0]) < 2;
          const horz = Math.abs(p0[1] - p1[1]) < 0.5 && Math.abs(q0[1] - q1[1]) < 0.5 && Math.abs(p0[1] - q0[1]) < 2;
          const k = vert ? 1 : 0;
          if (!vert && !horz) return false;
          const lo = Math.max(Math.min(p0[k], p1[k]), Math.min(q0[k], q1[k]));
          const hi = Math.min(Math.max(p0[k], p1[k]), Math.max(q0[k], q1[k]));
          return hi - lo > 4;
        }),
      );
      if (shared) errors.push(`layout: edges "${a.id}" and "${b.id}" run along the same line`);
    }

  for (const [k, g] of (spec.groups ?? []).entries()) {
    const box = regionLabelBox(stage.regions![k]);
    if (!box) continue;
    for (const id of ids) if (hit(box, fp.get(id)!)) errors.push(`layout: label of group "${g.id}" is drawn over node "${id}"`);
    for (const e of stage.edges) if (routeCrosses(geom[e.id], box, 0)) errors.push(`layout: edge "${e.id}" crosses the label of group "${g.id}"`);
  }
  return errors;
}

function main(): void {
  if (!fs.existsSync(DIAGRAMS_DIR)) {
    console.log('no diagram files found');
    process.exit(0);
  }
  let failed = 0;
  let checked = 0;
  for (const dir of fs.readdirSync(DIAGRAMS_DIR).sort()) {
    const dirPath = path.join(DIAGRAMS_DIR, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    const dirOk = KNOWN_TOPICS.size === 0 || KNOWN_TOPICS.has(dir);
    for (const file of fs.readdirSync(dirPath).sort()) {
      if (!file.endsWith('.json')) continue;
      checked++;
      const rel = `${dir}/${file}`;
      const errors: string[] = [];
      if (!dirOk) errors.push(`directory "${dir}" is not a topic slug in content/topic-map.json`);
      let spec: Spec | null = null;
      try {
        spec = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf-8'));
      } catch (e) {
        errors.push(`invalid JSON: ${(e as Error).message}`);
      }
      if (spec) {
        if (!validate(spec)) {
          for (const err of validate.errors ?? []) errors.push(`${err.instancePath || '/'} ${err.message}`);
        } else {
          errors.push(...crossCheck(spec, file.replace(/\.json$/, '')));
          errors.push(...layoutCheck(spec as unknown as InteractiveDiagram));
        }
      }
      if (errors.length === 0) {
        console.log(`OK   ${rel}`);
      } else {
        failed++;
        console.log(`FAIL ${rel}`);
        for (const e of errors) console.log(`       • ${e}`);
      }
    }
  }
  if (failed > 0) {
    console.log(`\n${failed}/${checked} diagram file(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\nAll ${checked} diagram file(s) valid.`);
}

main();
