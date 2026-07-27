import './db';
import express from 'express';
import cors from 'cors';
import { curriculumRouter } from './routes/curriculum';
import { sectionsRouter } from './routes/sections';
import { progressRouter } from './routes/progress';
import { notesRouter } from './routes/notes';
import { diagramsRouter } from './routes/diagrams';
import { devRouter } from './routes/dev';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', curriculumRouter);
app.use('/api', sectionsRouter);
app.use('/api', progressRouter);
app.use('/api', notesRouter);
app.use('/api', diagramsRouter);
app.use('/api', devRouter);

const PORT = 4000;
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));

export { app };
