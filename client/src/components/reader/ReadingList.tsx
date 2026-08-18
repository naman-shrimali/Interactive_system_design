import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, ShieldCheck } from 'lucide-react';
import { fetchReadingList, setReadingRead } from '../../api/client';
import { cn } from '../../lib/cn';
import type { ReadingEntry, ReadingTier } from '../../types';

/** Normative sources settle arguments; the ranking is why the tier is shown at all. */
const TIER_LABEL: Record<ReadingTier, string> = {
  normative: 'standard',
  authoritative: 'primary',
  interview: 'framing',
};

function TierBadge({ tier }: { tier: ReadingTier }) {
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        tier === 'normative' && 'bg-violet-500/12 text-violet-500',
        tier === 'authoritative' && 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
        tier === 'interview' && 'bg-amber-500/12 text-amber-600 dark:text-amber-500',
      )}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

export function ReadingList({ topicSlug }: { topicSlug: string }) {
  const [items, setItems] = useState<ReadingEntry[]>([]);

  useEffect(() => {
    let live = true;
    fetchReadingList(topicSlug).then((r) => {
      if (live) setItems(r);
    });
    return () => {
      live = false;
    };
  }, [topicSlug]);

  if (items.length === 0) return null;
  const done = items.filter((e) => e.read).length;

  const toggle = async (url: string, next: boolean) => {
    setItems((prev) => prev.map((e) => (e.url === url ? { ...e, read: next } : e)));
    await setReadingRead(url, next);
  };

  return (
    <section
      id="reading-list"
      className="mt-4 scroll-mt-20 rounded-2xl border border-line bg-raised p-5"
    >
      <div className="mb-1 flex items-center gap-2">
        <BookOpen size={15} className="text-ink-faint" />
        <h2 className="font-semibold tracking-tight">Go to the source</h2>
        <span className="ml-auto text-[12px] tabular-nums text-ink-faint">
          {done}/{items.length} read
        </span>
      </div>
      <p className="mb-4 text-[12px] leading-relaxed text-ink-muted">
        Hand-picked primary sources — the standard, paper, or documentation that settles the question
        rather than restating it.
      </p>

      <ul className="space-y-3">
        {items.map((e) => (
          <li key={e.url} className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={e.read}
              onChange={(ev) => toggle(e.url, ev.target.checked)}
              className="mt-1.5 h-3.5 w-3.5 shrink-0"
              style={{ accentColor: 'var(--accent)' }}
              aria-label={`Mark "${e.title}" as read`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'inline-flex items-center gap-1 text-[14px] font-medium underline-offset-2 hover:underline',
                    e.read ? 'text-ink-faint' : 'text-ink',
                  )}
                >
                  {e.title}
                  <ExternalLink size={11} className="shrink-0 opacity-60" />
                </a>
                <TierBadge tier={e.tier} />
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{e.why}</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-faint">
                <span>{e.publisher}</span>
                <span aria-hidden="true">·</span>
                <ShieldCheck size={11} />
                <span>link checked {e.lastVerified}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
