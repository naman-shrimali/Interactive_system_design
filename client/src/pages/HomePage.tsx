import { Link } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { Skeleton } from '../components/ui';
import { StatusMark } from '../components/layout/Sidebar';
import { ScenarioPlayer } from '../sim/Player';
import { SCENARIOS, scenariosFor } from '../sim/registry';
import { DIFFICULTY_LABEL } from '../lib/cn';

export function HomePage() {
  const curriculum = useAppStore((s) => s.curriculum);
  const lead = SCENARIOS[0];
  const topicCount = curriculum?.reduce((n, t) => n + t.topics.length, 0) ?? 30;
  const leadTopic = curriculum?.flatMap((t) => t.topics).find((t) => t.slug === lead.topic);

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-20 pt-10 sm:px-8">
      <section className="mb-8">
        <p className="label mb-4">
          {topicCount} topics · {SCENARIOS.length} {SCENARIOS.length === 1 ? 'scenario' : 'scenarios'} you can run
        </p>
        <h1 className="max-w-[18ch] font-display text-[clamp(34px,5vw,52px)] font-semibold leading-[1.02] tracking-[-0.012em]">
          System design, run one step at a time.
        </h1>
        <p className="mt-5 max-w-prose text-[17px] leading-relaxed text-ink-muted">
          Each topic is explained in prose and then, where it earns one, run as a scenario you can pause, rewind and break —
          the architecture, its live state, the code behind each step, and a checkpoint wherever an interviewer would stop
          you to ask why.
        </p>
      </section>

      <ScenarioPlayer
        scenario={lead}
        autoPlay
        crumb={
          <>
            <span>Running now</span>
            <span className="mx-1.5 text-scope-ink-3">/</span>
            <span className="text-scope-ink">{lead.title}</span>
          </>
        }
      />
      <p className="mt-2.5 text-[13px] text-ink-faint">
        It stops at the first checkpoint and waits for your prediction.{' '}
        <Link to={`/topics/${lead.topic}`} className="text-ink underline underline-offset-2">
          Read the {leadTopic?.title ?? lead.topic} topic →
        </Link>
      </p>

      <section className="mt-20" aria-labelledby="index-heading">
        <div className="mb-8 flex items-baseline justify-between gap-4 border-t border-ink pt-3">
          <h2 id="index-heading" className="font-display text-[26px] font-semibold">
            Curriculum
          </h2>
          <span className="font-mono text-[12px] text-ink-faint">in reading order</span>
        </div>

        {!curriculum && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        )}

        <div className="space-y-12">
          {curriculum?.map((track) => {
            const done = track.topics.filter((t) => t.sectionCount > 0 && t.sectionsCompleted === t.sectionCount).length;
            return (
              <section key={track.id} className="grid gap-x-10 gap-y-4 md:grid-cols-[240px_minmax(0,1fr)]">
                <header>
                  <h3 className="font-display text-[20px] font-semibold leading-tight">{track.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-snug text-ink-muted">{track.subtitle}</p>
                  <p className="mt-3 font-mono text-[12px] tabular-nums text-ink-faint">
                    {done} of {track.topics.length} complete
                  </p>
                </header>
                <ol className="border-t border-line">
                  {track.topics.map((topic) => {
                    const runnable = scenariosFor(topic.slug).length > 0;
                    return (
                      <li key={topic.id}>
                        <Link
                          to={`/topics/${topic.slug}`}
                          className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-line py-3 hover:bg-surface sm:grid-cols-[auto_minmax(0,1fr)_110px_56px]"
                        >
                          <span className="self-center pl-1">
                            <StatusMark topic={topic} />
                          </span>
                          <span className="min-w-0">
                            <span className="font-medium text-ink group-hover:underline group-hover:underline-offset-2">{topic.title}</span>
                            {runnable && (
                              <span className="ml-2 font-mono text-[10px] font-semibold tracking-[0.08em] text-accent">RUN</span>
                            )}
                            <span className="mt-0.5 block truncate text-[13px] text-ink-faint">{topic.summary}</span>
                          </span>
                          <span className="hidden font-mono text-[12px] text-ink-faint sm:block">{DIFFICULTY_LABEL[topic.difficulty]}</span>
                          <span className="pr-1 text-right font-mono text-[12px] tabular-nums text-ink-faint">{topic.estimatedMinutes}m</span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      </section>

      <footer className="mt-20 border-t border-line pt-5 text-[12px] leading-relaxed text-ink-faint">
        Text marked as such is from{' '}
        <a href="https://github.com/donnemartin/system-design-primer" target="_blank" rel="noopener noreferrer" className="underline">
          The System Design Primer
        </a>{' '}
        (MIT © Donne Martin). All other prose, every scenario and every diagram is original work.
      </footer>
    </div>
  );
}
