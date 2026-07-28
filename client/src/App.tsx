import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { CommandPalette } from './components/search/CommandPalette';
import { HomePage } from './pages/HomePage';
import { TopicPage } from './pages/TopicPage';
import { NotesPage } from './pages/NotesPage';
import { DashboardPage } from './pages/DashboardPage';
import { DiagramPreviewPage } from './pages/DiagramPreviewPage';

function Shell() {
  const loadCurriculum = useAppStore((s) => s.loadCurriculum);
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    void loadCurriculum();
  }, [loadCurriculum]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex h-full">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setNavOpen(true)} onSearch={() => setSearchOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/topics/:slug" element={<TopicPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/diagram-preview" element={<DiagramPreviewPage />} />
            {/* Legacy links from the pre-topic-model structure */}
            <Route path="/sections/:id" element={<Navigate to="/" replace />} />
            <Route path="/chapters/:id" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
