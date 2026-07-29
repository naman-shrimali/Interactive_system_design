import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock, Code2, ExternalLink as LinkIcon } from 'lucide-react';
import { fetchTopic } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { MarkdownView } from '../components/reader/MarkdownView';
import { ProgressControls } from '../components/reader/ProgressControls';
import { LinksPanel } from '../components/reader/LinksPanel';
import { NotesPanel } from '../components/reader/NotesPanel';
import { SectionDiagram } from '../components/diagram/SectionDiagram';
import { CodeSidebar } from '../components/code/CodeSidebar';
import { Badge, Skeleton } from '../components/ui';
import { DIFFICULTY_LABEL, KIND_LABEL } from '../lib/cn';
import type { TopicDetail } from '../types';

type Phase =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; topic: TopicDetail };

export function TopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<Phase>({ phase: 'loading' });
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const refresh = useAppStore((s) => s.refreshCurriculum);
  const scrollRoot = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!slug) return;
    setState({ phase: 'loading' });
    setCodeOpen(false);
    let alive = true;
    fetchTopic(slug)
      .then((topic) => alive && setState({ phase: 'ready', topic }))
      .catch((e) => alive && setState({ phase: 'error', message: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [slug]);

  const sections = state.phase === 'ready' ? state.topic.sections : [];

  // Highlight the section currently in view for the sticky table of contents.
  useEffect(() => {
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: '-72px 0px -60% 0px', threshold: 0 },
    );
    for (const s of sections) {
      const el = document.getElementById(`section-${s.slug}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  const reloadTopic = async () => {
    if (!slug) return;
    const topic = await fetchTopic(slug);
    setState({ phase: 'ready', topic });
    await refresh();
  };

  const totalMinutes = useMemo(
    () => (state.phase === 'ready' ? state.topic.estimatedMinutes : 0),
    [state],
  );

  if (state.phase === 'loading') {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <Skeleton className="mb-4 h-10 w-2/3" />
        <Skeleton className="mb-8 h-5 w-full" />
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (state.phase === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-red-500">
          {state.message}
        </div>
        <Link to="/" className="mt-4 inline-block text-sm text-ink-muted underline">
          Back to all tracks
        </Link>
      </div>
    );
  }

  const { topic } = state;

  return (
    <div ref={scrollRoot} style={{ ['--accent' as string]: topic.accent }}>
      {/* Hero */}
      <header className="border-b border-line bg-surface/60">
        <div className="mx-auto max-w-5xl px-5 py-9 sm:px-8">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
            <Link to="/" className="hover:text-ink">
              {topic.trackTitle}
            </Link>
            <span aria-hidden="true">›</span>
            <span className="text-ink-muted">{topic.title}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{topic.title}</h1>
          <p className="mt-3 max-w-3xl text-lg leading-relaxed text-ink-muted">{topic.summary}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge tone="accent" accent={topic.accent}>
              {DIFFICULTY_LABEL[topic.difficulty]}
            </Badge>
            <Badge tone="neutral">
              <Clock size={11} /> {totalMinutes} min
            </Badge>
            <Badge tone="neutral">
              {topic.sections.length} {topic.sections.length === 1 ? 'section' : 'sections'}
            </Badge>
            {topic.status === 'stub' && <Badge tone="warn">Being expanded</Badge>}
            {topic.codeWalkthroughs.length > 0 && (
              <button
                onClick={() => setCodeOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: topic.accent }}
              >
                <Code2 size={12} />
                Dry-run in code
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-10 px-5 py-9 sm:px-8">
        {/* Reading column */}
        <main className="min-w-0 flex-1">
          {topic.sections.map((section) => (
            <section
              key={section.id}
              id={`section-${section.slug}`}
              className="mb-14 scroll-mt-20"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div className="min-w-0">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: topic.accent }}
                  >
                    {KIND_LABEL[section.kind]}
                  </span>
                  <h2 className="text-2xl font-bold tracking-tight">{section.title}</h2>
                </div>
                <ProgressControls
                  sectionId={section.id}
                  status={section.progressStatus}
                  accent={topic.accent}
                  onChanged={reloadTopic}
                />
              </div>

              {section.contentMarkdown.trim() ? (
                <MarkdownView markdown={section.contentMarkdown} />
              ) : (
                <p className="italic text-ink-faint">This section is still being written.</p>
              )}

              {section.diagrams.map((d) => (
                <SectionDiagram key={d.id} meta={d} />
              ))}

              {section.provenance === 'primer' && section.attributionUrl && (
                <p className="mt-5 text-[11px] text-ink-faint">
                  Adapted from{' '}
                  <a
                    href={section.attributionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    The System Design Primer
                  </a>{' '}
                  — MIT © Donne Martin.
                </p>
              )}
            </section>
          ))}

          {topic.topicDiagrams.length > 0 && (
            <section id="diagrams" className="mb-14 scroll-mt-20">
              <h2 className="mb-4 border-b border-line pb-3 text-2xl font-bold tracking-tight">
                Diagrams
              </h2>
              {topic.topicDiagrams.map((d) => (
                <SectionDiagram key={d.id} meta={d} />
              ))}
            </section>
          )}

          <LinksPanel links={topic.links} onChanged={refresh} />
          <NotesPanel anchor={{ topicId: topic.id }} />

          {/* Prev / next */}
          <nav className="mt-12 grid gap-3 border-t border-line pt-6 sm:grid-cols-2">
            {topic.prev ? (
              <Link
                to={`/topics/${topic.prev.slug}`}
                className="group rounded-2xl border border-line p-4 hover:shadow-card"
              >
                <span className="flex items-center gap-1 text-[11px] text-ink-faint">
                  <ArrowLeft size={11} /> Previous
                </span>
                <span className="mt-1 block font-medium">{topic.prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {topic.next && (
              <Link
                to={`/topics/${topic.next.slug}`}
                className="group rounded-2xl border border-line p-4 text-right hover:shadow-card"
              >
                <span className="flex items-center justify-end gap-1 text-[11px] text-ink-faint">
                  Next <ArrowRight size={11} />
                </span>
                <span className="mt-1 block font-medium">{topic.next.title}</span>
              </Link>
            )}
          </nav>
        </main>

        {/* Sticky table of contents */}
        <aside className="hidden w-56 shrink-0 xl:block">
          <div className="sticky top-20">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              On this page
            </p>
            <ul className="space-y-1 border-l border-line">
              {topic.sections.map((s) => {
                const active = activeSection === `section-${s.slug}`;
                return (
                  <li key={s.id}>
                    <a
                      href={`#section-${s.slug}`}
                      className={`block border-l-2 py-1 pl-3 text-[13px] transition-colors ${
                        active ? 'font-medium text-ink' : 'border-transparent text-ink-muted hover:text-ink'
                      }`}
                      style={active ? { borderColor: topic.accent, marginLeft: '-1px' } : undefined}
                    >
                      {s.title}
                    </a>
                  </li>
                );
              })}
              {topic.links.length > 0 && (
                <li>
                  <a
                    href="#resources"
                    className="flex items-center gap-1.5 border-l-2 border-transparent py-1 pl-3 text-[13px] text-ink-muted hover:text-ink"
                  >
                    <LinkIcon size={11} /> Resources
                  </a>
                </li>
              )}
            </ul>
          </div>
        </aside>
      </div>

      {topic.codeWalkthroughs.length > 0 && (
        <CodeSidebar
          meta={topic.codeWalkthroughs[0]}
          open={codeOpen}
          onClose={() => setCodeOpen(false)}
        />
      )}
    </div>
  );
}
