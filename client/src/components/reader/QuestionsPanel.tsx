import { useEffect, useState } from 'react';
import { HelpCircle, ChevronDown, CornerDownRight, ExternalLink } from 'lucide-react';
import { fetchQuestions } from '../../api/client';
import { cn } from '../../lib/cn';
import type { TopicQuestion, QuestionKind } from '../../types';

const KIND_LABEL: Record<QuestionKind, string> = {
  question: 'asked',
  misconception: 'commonly believed',
  trap: 'trap',
};

/** The prompt of a misconception is a claim someone makes, so it reads as a
 *  quote; a question reads as a question. Framing them identically would lose
 *  the distinction that makes the format worth having. */
function Prompt({ q }: { q: TopicQuestion }) {
  if (q.kind === 'question') return <>{q.prompt}</>;
  return <>&ldquo;{q.prompt}&rdquo;</>;
}

function KindBadge({ kind }: { kind: QuestionKind }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        kind === 'question' && 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
        kind === 'misconception' && 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
        kind === 'trap' && 'bg-amber-500/12 text-amber-600 dark:text-amber-500',
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

function Item({ q }: { q: TopicQuestion }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-xl border border-line">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 p-3 text-left"
      >
        <KindBadge kind={q.kind} />
        <span
          className={cn(
            'min-w-0 flex-1 text-[13.5px] leading-relaxed',
            q.kind === 'misconception' && 'italic',
          )}
        >
          <Prompt q={q} />
        </span>
        <ChevronDown
          size={14}
          className={cn('mt-0.5 shrink-0 text-ink-faint transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="animate-fade-up border-t border-line px-3 pb-3 pt-2.5">
          <p className="text-[13px] leading-relaxed text-ink-muted">{q.answer}</p>

          {q.followUp && (
            <p className="mt-2.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-faint">
              <CornerDownRight size={12} className="mt-0.5 shrink-0" />
              <span>
                <span className="font-medium">Then they ask:</span> {q.followUp}
              </span>
            </p>
          )}

          {q.source && (
            <a
              href={q.source}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
            >
              <ExternalLink size={10} /> source
            </a>
          )}
        </div>
      )}
    </li>
  );
}

export function QuestionsPanel({ topicSlug }: { topicSlug: string }) {
  const [items, setItems] = useState<TopicQuestion[]>([]);

  useEffect(() => {
    let live = true;
    fetchQuestions(topicSlug).then((q) => {
      if (live) setItems(q);
    });
    return () => {
      live = false;
    };
  }, [topicSlug]);

  if (items.length === 0) return null;

  return (
    <section
      id="questions"
      className="mt-4 scroll-mt-20 rounded-2xl border border-line bg-raised p-5"
    >
      <div className="mb-1 flex items-center gap-2">
        <HelpCircle size={15} className="text-ink-faint" />
        <h2 className="font-semibold tracking-tight">Where this gets tested</h2>
        <span className="ml-auto text-[12px] tabular-nums text-ink-faint">{items.length}</span>
      </div>
      <p className="mb-4 text-[12px] leading-relaxed text-ink-muted">
        Answer each one before expanding it — recognising an answer is not the same as being able to
        produce it.
      </p>

      <ul className="space-y-2">
        {items.map((q) => (
          <Item key={q.prompt} q={q} />
        ))}
      </ul>
    </section>
  );
}
