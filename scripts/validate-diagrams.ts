/** TASK-009: Validate hand-authored diagram JSON against the schema + cross-reference rules. */
import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

const ROOT = path.join(__dirname, '..');
const DIAGRAMS_DIR = path.join(ROOT, 'content', 'diagrams');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, 'diagram.schema.json'), 'utf-8'));

const ajv = new Ajv({ allErrors: true, useDefaults: false });
const validate = ajv.compile(SCHEMA);

const SOURCE_HANDLES = new Set(['bottom', 'right']);
const TARGET_HANDLES = new Set(['top', 'left']);

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
    if (e.sourceHandle && !SOURCE_HANDLES.has(e.sourceHandle)) errors.push(`edge ${e.id}: sourceHandle must be bottom/right`);
    if (e.targetHandle && !TARGET_HANDLES.has(e.targetHandle)) errors.push(`edge ${e.id}: targetHandle must be top/left`);
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
    const parts = dir.split('__');
    const dirOk = parts.length === 3 && parts.every((p) => p.length > 0);
    for (const file of fs.readdirSync(dirPath).sort()) {
      if (!file.endsWith('.json')) continue;
      checked++;
      const rel = `${dir}/${file}`;
      const errors: string[] = [];
      if (!dirOk) errors.push(`directory name must be source__chapter__section: ${dir}`);
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
