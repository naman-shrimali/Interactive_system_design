import { Router } from 'express';
import { db } from '../db';

export const diagramsRouter = Router();

interface DiagramRow { id: number; slug: string; title: string; spec_json: string }

diagramsRouter.get('/diagrams/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const row = db
    .prepare(`SELECT id, slug, title, spec_json FROM diagrams WHERE id = ?`)
    .get(id) as DiagramRow | undefined;
  if (!row) return res.status(404).json({ error: 'diagram not found' });
  res.json({ id: row.id, slug: row.slug, title: row.title, spec: JSON.parse(row.spec_json) });
});
