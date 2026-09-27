import { useEffect, useState } from 'react';
import { ChevronDown, CornerDownRight, ExternalLink } from 'lucide-react';
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

/** Kind as plain mono text. Colour follows meaning: a question is neutral, a
 *  misconception is a wrong belief, a trap is a place to slow down. */
function KindBadge({ kind }: { kind: QuestionKind }) {
  return (
    <span
      className={cn(
        'w-[118px] shrink-0 pt-px font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em]',
        kind === 'question' && 'text-ink-faint',
        kind === 'misconception' && 'text-fail',
        kind === 'trap' && 'text-cp',
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

function Item({ q }: { q: TopicQuestion }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="border-b border-line">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 py-3 text-left hover:bg-surface"
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
        <div className="pb-4 pl-[130px] pr-6">
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
      className="mb-16 scroll-mt-20"
    >
      <div className="mb-2 flex items-baseline justify-between gap-3 border-t border-ink pt-3">
        <h2 className="font-display text-[22px] font-semibold">Where this gets tested</h2>
        <span className="font-mono text-[12px] tabular-nums text-ink-faint">{items.length}</span>
      </div>
      <p className="mb-4 text-[12px] leading-relaxed text-ink-muted">
        Answer each one before expanding it — recognising an answer is not the same as being able to
        produce it.
      </p>

      <ul className="border-t border-line">
        {items.map((q) => (
          <Item key={q.prompt} q={q} />
        ))}
      </ul>
    </section>
  );
}
