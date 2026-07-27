import { useEffect, useState } from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { setLinkCompleted } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { ExternalLink } from '../../types';

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function LinksPanel({ links }: { links: ExternalLink[] }) {
  const [items, setItems] = useState<ExternalLink[]>(links);
  const refresh = useAppStore((s) => s.refreshCurriculum);

  useEffect(() => setItems(links), [links]);

  if (items.length === 0) return null;
  const completedCount = items.filter((l) => l.completed).length;

  const toggle = async (id: number, next: boolean) => {
    setItems((prev) => prev.map((l) => (l.id === id ? { ...l, completed: next } : l)));
    try {
      await setLinkCompleted(id, next);
      await refresh();
    } catch {
      setItems((prev) => prev.map((l) => (l.id === id ? { ...l, completed: !next } : l)));
    }
  };

  return (
    <section className="border border-slate-200 rounded-lg p-4 mt-8">
      <div className="flex items-center gap-2 mb-3">
        <LinkIcon size={16} className="text-slate-500" />
        <h2 className="font-semibold text-slate-800">External resources</h2>
        <span className="ml-auto text-sm text-slate-500">
          {completedCount}/{items.length} completed
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((link) => (
          <li key={link.id} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={link.completed}
              onChange={(e) => toggle(link.id, e.target.checked)}
              className="mt-1 shrink-0"
            />
            <span className="min-w-0">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`hover:underline ${link.completed ? 'line-through text-slate-400' : 'text-blue-700'}`}
              >
                {link.title}
              </a>
              {hostname(link.url) && (
                <span className="text-xs text-slate-400 ml-2">{hostname(link.url)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
