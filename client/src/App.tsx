import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { HomePage } from './pages/HomePage';
import { SectionPage } from './pages/SectionPage';
import { ChapterPage } from './pages/ChapterPage';
import { NotesPage } from './pages/NotesPage';

export default function App() {
  const loadCurriculum = useAppStore((s) => s.loadCurriculum);
  useEffect(() => {
    void loadCurriculum();
  }, [loadCurriculum]);

  return (
    <BrowserRouter>
      <div className="flex h-screen text-slate-800">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/sections/:id" element={<SectionPage />} />
              <Route path="/chapters/:id" element={<ChapterPage />} />
              <Route path="/notes" element={<NotesPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
