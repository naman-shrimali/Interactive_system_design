/** TASK-024: local-only dev routes to read raw diagram files for the authoring preview. */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';

export const devRouter = Router();

const DIAGRAMS_ROOT = path.resolve(path.join(__dirname, '..', '..', '..', 'content', 'diagrams'));
const NAME_RE = /^[a-z0-9-]+\/[a-z0-9-]+\.json$/;

devRouter.get('/dev/diagram-files', (_req, res) => {
  if (!fs.existsSync(DIAGRAMS_ROOT)) return res.json({ files: [] });
  const files: string[] = [];
  for (const dir of fs.readdirSync(DIAGRAMS_ROOT).sort()) {
    const dirPath = path.join(DIAGRAMS_ROOT, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    for (const file of fs.readdirSync(dirPath).sort()) {
      if (file.endsWith('.json')) files.push(`${dir}/${file}`);
    }
  }
  res.json({ files });
});

devRouter.get('/dev/diagram-file', (req, res) => {
  const name = req.query.name;
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    return res.status(400).json({ error: 'invalid name' });
  }
  const resolved = path.resolve(path.join(DIAGRAMS_ROOT, name));
  if (!resolved.startsWith(DIAGRAMS_ROOT + path.sep)) {
    return res.status(400).json({ error: 'invalid name' });
  }
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'file not found' });
  res.json(JSON.parse(fs.readFileSync(resolved, 'utf-8')));
});
