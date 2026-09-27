import { useEffect, useState } from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { setLinkCompleted } from '../../api/client';
import { cn } from '../../lib/cn';
import type { ExternalLink } from '../../types';

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function LinksPanel({
  links,
  onChanged,
}: {
  links: ExternalLink[];
  onChanged?: () => Promise<void> | void;
}) {
  const [items, setItems] = useState<ExternalLink[]>(links);
  useEffect(() => setItems(links), [links]);

  if (items.length === 0) return null;
  const done = items.filter((l) => l.completed).length;

  const toggle = async (id: number, next: boolean) => {
    setItems((prev) => prev.map((l) => (l.id === id ? { ...l, completed: next } : l)));
    try {
      await setLinkCompleted(id, next);
      await onChanged?.();
    } catch {
      setItems((prev) => prev.map((l) => (l.id === id ? { ...l, completed: !next } : l)));
    }
  };

  return (
    <section id="resources" className="mt-4 scroll-mt-20 rounded-md border border-line bg-raised p-5">
      <div className="mb-4 flex items-center gap-2">
        <LinkIcon size={15} className="text-ink-faint" />
        <h2 className="font-semibold tracking-tight">External resources</h2>
        <span className="ml-auto text-[12px] tabular-nums text-ink-faint">
          {done}/{items.length} read
        </span>
      </div>
      <ul className="space-y-2.5">
        {items.map((link) => (
          <li key={link.id} className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={link.completed}
              onChange={(e) => toggle(link.id, e.target.checked)}
              className="mt-1 h-3.5 w-3.5 shrink-0 accent-current"
              style={{ accentColor: 'rgb(var(--accent))' }}
              aria-label={`Mark "${link.title}" as read`}
            />
            <span className="min-w-0 text-[14px]">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'underline-offset-2 hover:underline',
                  link.completed ? 'text-ink-faint line-through' : 'text-ink',
                )}
              >
                {link.title}
              </a>
              {hostname(link.url) && (
                <span className="ml-2 text-[11px] text-ink-faint">{hostname(link.url)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
