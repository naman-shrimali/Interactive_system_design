import { Link } from 'react-router-dom';
import { ArrowRight, Clock } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Badge, ProgressBar, Skeleton } from '../components/ui';
import { DIFFICULTY_LABEL } from '../lib/cn';

export function HomePage() {
  const curriculum = useAppStore((s) => s.curriculum);

  const totals = (curriculum ?? []).reduce(
    (acc, t) => {
      for (const topic of t.topics) {
        acc.topics++;
        acc.sections += topic.sectionCount;
        acc.done += topic.sectionsCompleted;
      }
      return acc;
    },
    { topics: 0, sections: 0, done: 0 },
  );

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Learn system design,
          <br />
          <span className="text-ink-muted">one topic at a time.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-muted">
          A merged curriculum drawn from The System Design Primer and original material — organised
          by topic, with interactive diagrams, progress tracking, and notes.
        </p>
        {curriculum && (
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted">
            <span>
              <strong className="text-ink">{totals.topics}</strong> topics
            </span>
            <span>
              <strong className="text-ink">{totals.sections}</strong> sections
            </span>
            <span>
              <strong className="text-ink">{totals.done}</strong> completed
            </span>
          </div>
        )}
      </header>

      {!curriculum && (
        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {curriculum?.map((track) => {
          const done = track.topics.filter(
            (t) => t.sectionCount > 0 && t.sectionsCompleted === t.sectionCount,
          ).length;
          const first = track.topics[0];
          return (
            <section
              key={track.id}
              className="group relative overflow-hidden rounded-3xl border border-line bg-raised p-6 transition-shadow hover:shadow-lift"
              style={{ ['--accent' as string]: track.accent }}
            >
              <div
                className="absolute inset-x-0 top-0 h-1.5"
                style={{ background: track.accent }}
                aria-hidden="true"
              />
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="text-xl font-bold tracking-tight">{track.title}</h2>
                <Badge tone="accent" accent={track.accent}>
                  {track.topics.length} topics
                </Badge>
              </div>
              <p className="mb-5 text-sm leading-relaxed text-ink-muted">{track.subtitle}</p>

              <ul className="mb-5 space-y-1.5">
                {track.topics.slice(0, 4).map((topic) => (
                  <li key={topic.id}>
                    <Link
                      to={`/topics/${topic.slug}`}
                      className="flex items-center gap-2 text-[13px] text-ink-muted hover:text-ink"
                    >
                      <span
                        className="h-1 w-1 shrink-0 rounded-full"
                        style={{ background: track.accent }}
                      />
                      <span className="truncate">{topic.title}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-ink-faint">
                        <Clock size={10} />
                        {topic.estimatedMinutes}m
                      </span>
                    </Link>
                  </li>
                ))}
                {track.topics.length > 4 && (
                  <li className="pl-3 text-[12px] text-ink-faint">
                    +{track.topics.length - 4} more
                  </li>
                )}
              </ul>

              <ProgressBar value={done} total={track.topics.length} accent={track.accent} />
              <div className="mt-3 flex items-center justify-between text-[12px] text-ink-faint">
                <span>
                  {done}/{track.topics.length} complete
                </span>
                {first && (
                  <Link
                    to={`/topics/${first.slug}`}
                    className="inline-flex items-center gap-1 font-medium"
                    style={{ color: track.accent }}
                  >
                    Start <ArrowRight size={12} />
                  </Link>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {curriculum && (
        <section className="mt-12">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Start here
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {curriculum[0]?.topics.slice(0, 3).map((topic) => (
              <Link
                key={topic.id}
                to={`/topics/${topic.slug}`}
                className="rounded-2xl border border-line bg-raised p-4 transition-shadow hover:shadow-card"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone="neutral">{DIFFICULTY_LABEL[topic.difficulty]}</Badge>
                </div>
                <h3 className="mb-1 font-semibold leading-snug">{topic.title}</h3>
                <p className="line-clamp-2 text-[13px] text-ink-muted">{topic.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-14 border-t border-line pt-5 text-xs leading-relaxed text-ink-faint">
        Text marked as such is from{' '}
        <a
          href="https://github.com/donnemartin/system-design-primer"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          The System Design Primer
        </a>{' '}
        (MIT © Donne Martin). All other prose and every interactive diagram is original work.
      </footer>
    </div>
  );
}
