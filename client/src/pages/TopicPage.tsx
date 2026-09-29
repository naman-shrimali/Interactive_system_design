import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { fetchTopic } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { MarkdownView } from '../components/reader/MarkdownView';
import { ProgressControls } from '../components/reader/ProgressControls';
import { LinksPanel } from '../components/reader/LinksPanel';
import { ReadingList } from '../components/reader/ReadingList';
import { QuestionsPanel } from '../components/reader/QuestionsPanel';
import { NotesPanel } from '../components/reader/NotesPanel';
import { SectionDiagram } from '../components/diagram/SectionDiagram';
import { CodeSidebar } from '../components/code/CodeSidebar';
import { Skeleton } from '../components/ui';
import { ScenarioPlayer } from '../sim/Player';
import { scenariosFor } from '../sim/registry';
import { DIFFICULTY_LABEL, KIND_LABEL, cn } from '../lib/cn';
import type { TopicDetail } from '../types';

type Phase =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; topic: TopicDetail };

export function TopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<Phase>({ phase: 'loading' });
  const [codeOpen, setCodeOpen] = useState(false);
  const refresh = useAppStore((s) => s.refreshCurriculum);
  const scenarios = useMemo(() => (slug ? scenariosFor(slug) : []), [slug]);
  const [scenarioIdx, setScenarioIdx] = useState(0);

  useEffect(() => {
    if (!slug) return;
    setState({ phase: 'loading' });
    setCodeOpen(false);
    setScenarioIdx(0);
    let alive = true;
    fetchTopic(slug)
      .then((topic) => alive && setState({ phase: 'ready', topic }))
      .catch((e) => alive && setState({ phase: 'error', message: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [slug]);

  const reloadTopic = async () => {
    if (!slug) return;
    const topic = await fetchTopic(slug);
    setState({ phase: 'ready', topic });
    await refresh();
  };

  if (state.phase === 'loading') {
    return (
      <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8">
        <Skeleton className="mb-4 h-10 w-2/3" />
        <Skeleton className="mb-8 h-5 w-full" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (state.phase === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10">
        <p className="rounded border border-fail/30 bg-fail/5 p-4 text-fail">{state.message}</p>
        <Link to="/" className="mt-4 inline-block text-sm text-ink-muted underline">
          Back to all topics
        </Link>
      </div>
    );
  }

  const { topic } = state;
  const scenario = scenarios[scenarioIdx];
  const done = topic.sections.filter((s) => s.progressStatus === 'completed').length;
  const tocExtras: { href: string; label: string }[] = [
    { href: '#questions', label: 'Where this gets tested' },
    { href: '#reading-list', label: 'Go to the source' },
    ...(topic.links.length > 0 ? [{ href: '#resources', label: 'Further reading' }] : []),
    { href: '#notes', label: 'My notes' },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-20 pt-8 sm:px-8">
      {/* ---- header ---- */}
      <header className="mb-8">
        <nav className="mb-4 font-mono text-[12px] text-ink-faint" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-ink">
            {topic.trackTitle}
          </Link>
          <span className="mx-2" aria-hidden="true">
            /
          </span>
          <span className="text-ink-muted">{topic.title}</span>
        </nav>
        <h1 className="max-w-[22ch] font-display text-[clamp(32px,4.4vw,46px)] font-semibold leading-[1.04] tracking-[-0.01em]">
          {topic.title}
        </h1>
        <p className="mt-4 max-w-prose text-[17px] leading-relaxed text-ink-muted">{topic.summary}</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] text-ink-faint">
          <span>{DIFFICULTY_LABEL[topic.difficulty]}</span>
          <span>{topic.estimatedMinutes} min</span>
          <span>
            {done}/{topic.sections.length} sections done
          </span>
          {topic.status === 'stub' && <span className="text-cp">being expanded</span>}
          {topic.codeWalkthroughs.length > 0 && (
            <button
              onClick={() => setCodeOpen(true)}
              className="rounded border border-line px-2.5 py-1 text-ink hover:border-ink-faint"
            >
              Dry-run in code →
            </button>
          )}
        </div>
      </header>

      <nav className="mb-10 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-y border-line py-2.5 text-[13px]" aria-label="On this page">
        <span className="label">On this page</span>
        {topic.sections.map((s) => (
          <a key={s.id} href={`#section-${s.slug}`} className="text-ink-muted hover:text-ink">
            {s.title}
          </a>
        ))}
        {tocExtras.map((x) => (
          <a key={x.href} href={x.href} className="text-ink-faint hover:text-ink">
            {x.label}
          </a>
        ))}
      </nav>

      {/* ---- scenario ---- */}
      {scenario && (
        <section className="mb-14" aria-label="Scenario">
          {scenarios.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1 font-mono text-[12px]" role="tablist">
              {scenarios.map((s, k) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={k === scenarioIdx}
                  onClick={() => setScenarioIdx(k)}
                  className={cn(
                    'rounded px-2.5 py-1',
                    k === scenarioIdx ? 'bg-ink text-canvas' : 'text-ink-muted hover:bg-surface',
                  )}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}
          <ScenarioPlayer
            key={scenario.id}
            scenario={scenario}
            syncHash
            crumb={
              <>
                <span>{topic.title}</span>
                <span className="mx-1.5 text-scope-ink-3">/</span>
                <span className="text-scope-ink">{scenario.title}</span>
              </>
            }
          />
          <p className="mt-2.5 max-w-prose text-[13px] text-ink-faint">
            {scenario.summary} Every number is computed by running the scenario; latencies come from the
            project’s facts registry.
          </p>
        </section>
      )}

      {/* ---- lesson ---- */}
      <main className="min-w-0">
          {topic.sections.map((section) => (
            <section key={section.id} id={`section-${section.slug}`} className="mb-16 scroll-mt-20">
              <div className="mb-5 flex max-w-prose flex-wrap items-end justify-between gap-3 border-t border-ink pt-3">
                <div className="min-w-0">
                  <p className="label mb-1.5">{KIND_LABEL[section.kind]}</p>
                  <h2 className="font-display text-[26px] font-semibold leading-tight">{section.title}</h2>
                </div>
                <ProgressControls sectionId={section.id} status={section.progressStatus} onChanged={reloadTopic} />
              </div>

              <div className="max-w-prose">
                {section.contentMarkdown.trim() ? (
                  <MarkdownView markdown={section.contentMarkdown} />
                ) : (
                  <p className="italic text-ink-faint">This section is still being written.</p>
                )}
              </div>

              {section.diagrams.map((d) => (
                <SectionDiagram key={d.id} meta={d} />
              ))}

              {section.provenance === 'primer' && section.attributionUrl && (
                <p className="mt-5 font-mono text-[11px] text-ink-faint">
                  Adapted from{' '}
                  <a href={section.attributionUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    The System Design Primer
                  </a>{' '}
                  — MIT © Donne Martin.
                </p>
              )}
            </section>
          ))}

          {topic.topicDiagrams.length > 0 && (
            <section id="diagrams" className="mb-16 scroll-mt-20">
              <div className="mb-5 max-w-prose border-t border-ink pt-3">
                <p className="label mb-1.5">Diagrams</p>
              </div>
              {topic.topicDiagrams.map((d) => (
                <SectionDiagram key={d.id} meta={d} />
              ))}
            </section>
          )}

          <div className="max-w-prose">
            <QuestionsPanel topicSlug={topic.slug} />
            <ReadingList topicSlug={topic.slug} />
            <LinksPanel links={topic.links} onChanged={refresh} />
            <NotesPanel anchor={{ topicId: topic.id }} />
          </div>

          <nav className="mt-16 grid max-w-prose gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-2" aria-label="Neighbouring topics">
            {topic.prev ? (
              <Link to={`/topics/${topic.prev.slug}`} className="bg-canvas p-4 hover:bg-surface">
                <span className="label flex items-center gap-1">
                  <ArrowLeft size={11} /> Previous
                </span>
                <span className="mt-1.5 block font-medium">{topic.prev.title}</span>
              </Link>
            ) : (
              <span className="hidden bg-canvas sm:block" />
            )}
            {topic.next ? (
              <Link to={`/topics/${topic.next.slug}`} className="bg-canvas p-4 text-right hover:bg-surface">
                <span className="label flex items-center justify-end gap-1">
                  Next <ArrowRight size={11} />
                </span>
                <span className="mt-1.5 block font-medium">{topic.next.title}</span>
              </Link>
            ) : (
              <span className="hidden bg-canvas sm:block" />
            )}
          </nav>
      </main>

      {topic.codeWalkthroughs.length > 0 && (
        <CodeSidebar meta={topic.codeWalkthroughs[0]} open={codeOpen} onClose={() => setCodeOpen(false)} />
      )}
    </div>
  );
}
