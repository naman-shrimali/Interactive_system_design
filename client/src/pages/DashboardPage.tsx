import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Link as LinkIcon, Workflow, ArrowRight } from 'lucide-react';
import { fetchProgressSummary } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { Card, ProgressBar, Skeleton } from '../components/ui';
import type { ProgressSummaryTrack } from '../types';

function Stat({
  icon,
  label,
  value,
  total,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  total: number;
  accent: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="tabular-nums text-ink-faint">
          {value}/{total}
        </span>
      </div>
      <ProgressBar value={value} total={total} accent={accent} />
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
    (acc, t) => {
      acc.topicsTotal += t.topicsTotal;
      acc.topicsCompleted += t.topicsCompleted;
      acc.sectionsTotal += t.sectionsTotal;
      acc.sectionsCompleted += t.sectionsCompleted;
      acc.linksTotal += t.linksTotal;
      acc.linksCompleted += t.linksCompleted;
      acc.diagramsTotal += t.diagramsTotal;
      acc.diagramsViewed += t.diagramsViewed;
      return acc;
    },
    {
      topicsTotal: 0,
      topicsCompleted: 0,
      sectionsTotal: 0,
      sectionsCompleted: 0,
      linksTotal: 0,
      linksCompleted: 0,
      diagramsTotal: 0,
      diagramsViewed: 0,
    },
  );

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <h1 className="mb-1 text-3xl font-bold tracking-tight">Your progress</h1>
      <p className="mb-8 text-ink-muted">
        A track-by-track breakdown of what you've completed so far.
      </p>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-red-500">
          {error}
        </div>
      )}

      {!tracks && !error && (
        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      )}

      {overall && overall.sectionsTotal > 0 && (
        <Card className="mb-8 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Overall
          </h2>
          <div className="grid gap-5 sm:grid-cols-3">
            <Stat
              icon={<CheckCircle2 size={13} />}
              label="Topics fully complete"
              value={overall.topicsCompleted}
              total={overall.topicsTotal}
              accent="#0ea5e9"
            />
            <Stat
              icon={<LinkIcon size={13} />}
              label="Resources read"
              value={overall.linksCompleted}
              total={overall.linksTotal}
              accent="#0ea5e9"
            />
            <Stat
              icon={<Workflow size={13} />}
              label="Diagrams viewed"
              value={overall.diagramsViewed}
              total={overall.diagramsTotal}
              accent="#0ea5e9"
            />
          </div>
        </Card>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {tracks?.map((track) => {
          const curTrack = curriculum?.find((t) => t.slug === track.slug);
          const nextTopic = curTrack?.topics.find(
            (t) => !(t.sectionCount > 0 && t.sectionsCompleted === t.sectionCount),
          );
          return (
            <Card key={track.slug} className="p-5" style={{ ['--accent' as string]: track.accent }}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight">{track.title}</h2>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: `color-mix(in srgb, ${track.accent} 14%, transparent)`,
                    color: track.accent,
                  }}
                >
                  {track.topicsCompleted}/{track.topicsTotal} topics
                </span>
              </div>

              <div className="space-y-4">
                <Stat
                  icon={<CheckCircle2 size={12} />}
                  label="Sections completed"
                  value={track.sectionsCompleted}
                  total={track.sectionsTotal}
                  accent={track.accent}
                />
                <Stat
                  icon={<LinkIcon size={12} />}
                  label="Resources read"
                  value={track.linksCompleted}
                  total={track.linksTotal}
                  accent={track.accent}
                />
                <Stat
                  icon={<Workflow size={12} />}
                  label="Diagrams viewed"
                  value={track.diagramsViewed}
                  total={track.diagramsTotal}
                  accent={track.accent}
                />
              </div>

              {nextTopic && (
                <Link
                  to={`/topics/${nextTopic.slug}`}
                  className="mt-4 flex items-center justify-between rounded-xl border border-line px-3 py-2 text-[13px] text-ink-muted hover:bg-surface hover:text-ink"
                >
                  <span className="truncate">
                    Continue: <span className="font-medium text-ink">{nextTopic.title}</span>
                  </span>
                  <ArrowRight size={13} className="shrink-0" style={{ color: track.accent }} />
                </Link>
              )}
            </Card>
          );
        })}
      </div>

      {tracks && overall && overall.sectionsCompleted === 0 && (
        <p className="mt-8 text-center text-sm text-ink-faint">
          You haven't marked anything complete yet —{' '}
          <Link to="/" className="underline">
            pick a track
          </Link>{' '}
          to get started.
        </p>
      )}
    </div>
  );
}
