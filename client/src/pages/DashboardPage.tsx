import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProgressSummary } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { ProgressBar, Skeleton } from '../components/ui';
import type { ProgressSummaryTrack } from '../types';

function Stat({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-ink-muted">{label}</span>
        <span className="font-mono text-[12px] tabular-nums text-ink">
          {value}
          <span className="text-ink-faint">/{total}</span>
        </span>
      </div>
      <ProgressBar value={value} total={total} />
    </div>
  );
}

export function DashboardPage() {
  const [tracks, setTracks] = useState<ProgressSummaryTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const curriculum = useAppStore((s) => s.curriculum);

  useEffect(() => {
    fetchProgressSummary()
      .then(setTracks)
      .catch((e) => setError((e as Error).message));
  }, []);

  const overall = tracks?.reduce(
    (acc, t) => ({
      topicsTotal: acc.topicsTotal + t.topicsTotal,
      topicsCompleted: acc.topicsCompleted + t.topicsCompleted,
      sectionsTotal: acc.sectionsTotal + t.sectionsTotal,
      sectionsCompleted: acc.sectionsCompleted + t.sectionsCompleted,
      linksTotal: acc.linksTotal + t.linksTotal,
      linksCompleted: acc.linksCompleted + t.linksCompleted,
    }),
    { topicsTotal: 0, topicsCompleted: 0, sectionsTotal: 0, sectionsCompleted: 0, linksTotal: 0, linksCompleted: 0 },
  );

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-20 pt-10 sm:px-8">
      <p className="label mb-3">Progress</p>
      <h1 className="font-display text-[clamp(30px,4vw,42px)] font-semibold leading-tight">Where you are</h1>
      <p className="mt-3 max-w-prose text-ink-muted">
        Stored in this browser only — there is no account, so progress doesn’t follow you to another device.
      </p>

      {error && <p className="mt-6 rounded border border-fail/30 bg-fail/5 p-4 text-fail">{error}</p>}

      {!tracks && !error && (
        <div className="mt-10 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {overall && (
        <div className="mt-10 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
          {[
            ['Topics complete', overall.topicsCompleted, overall.topicsTotal],
            ['Sections done', overall.sectionsCompleted, overall.sectionsTotal],
            ['Resources read', overall.linksCompleted, overall.linksTotal],
          ].map(([label, v, t]) => (
            <div key={label as string} className="bg-canvas p-5">
              <p className="label mb-2">{label}</p>
              <p className="font-mono text-[28px] font-medium tabular-nums leading-none">
                {v as number}
                <span className="text-[16px] text-ink-faint"> / {t as number}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-14 space-y-10">
        {tracks?.map((track) => {
          const curTrack = curriculum?.find((t) => t.slug === track.slug);
          const nextTopic = curTrack?.topics.find((t) => !(t.sectionCount > 0 && t.sectionsCompleted === t.sectionCount));
          return (
            <section key={track.slug} className="grid gap-x-10 gap-y-4 border-t border-line pt-5 md:grid-cols-[240px_minmax(0,1fr)]">
              <header>
                <h2 className="font-display text-[20px] font-semibold leading-tight">{track.title}</h2>
                <p className="mt-2 font-mono text-[12px] text-ink-faint">
                  {track.topicsCompleted} of {track.topicsTotal} topics complete
                </p>
                {nextTopic && (
                  <Link to={`/topics/${nextTopic.slug}`} className="mt-3 inline-block text-[14px] text-ink underline underline-offset-2">
                    Continue with {nextTopic.title} →
                  </Link>
                )}
              </header>
              <div className="grid gap-5 sm:grid-cols-3">
                <Stat label="Sections done" value={track.sectionsCompleted} total={track.sectionsTotal} />
                <Stat label="Resources read" value={track.linksCompleted} total={track.linksTotal} />
                <Stat label="Diagrams viewed" value={track.diagramsViewed} total={track.diagramsTotal} />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
