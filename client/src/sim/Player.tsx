import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Stage, TONE } from './Stage';
import { defaultKnobs, stageOf } from './types';
import type { Checkpoint, Frame, KnobValue, KnobValues, Scenario } from './types';
import { cn } from '../lib/cn';

/* ------------------------------------------------------------------ */
/* Code highlighting — scope palette, JS only, dependency-free          */
/* ------------------------------------------------------------------ */

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

function highlight(line: string): string {
  return esc(line).replace(
    /(\/\/.*$)|('(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*")|\b(const|let|async|function|await|return|if|else|for|of|new|true|false|null)\b|\b(\d+(?:\.\d+)?)\b/g,
    (m, cm, str, kw, num) => {
      if (cm) return `<span class="text-scope-ink-3 italic">${cm}</span>`;
      if (str) return `<span class="text-[#8FD6A8]">${str}</span>`;
      if (kw) return `<span class="text-[#C4A7FF]">${kw}</span>`;
      if (num) return `<span class="text-scope-cp">${num}</span>`;
      return m;
    },
  );
}

/* ------------------------------------------------------------------ */
/* Small controls                                                       */
/* ------------------------------------------------------------------ */

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const ICON = {
  prev: 'M10.5 3.5 5 8l5.5 4.5z',
  next: 'M5.5 3.5 11 8l-5.5 4.5z',
  play: 'M5 3l8 5-8 5z',
  pause: 'M4 3h3v10H4zM9 3h3v10H9z',
  restart: 'M8 3a5 5 0 1 1-4.9 6h1.6A3.5 3.5 0 1 0 8 4.5V6.5L5 3.75 8 1z',
};

const tbtn =
  'grid h-8 w-8 place-items-center rounded border border-scope-line text-scope-ink hover:border-scope-ink-3 disabled:opacity-40';

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer select-none items-center gap-2 font-mono text-[12px] text-scope-ink-2">
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        className={cn(
          'relative h-4 w-[30px] rounded-full transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-scope-accent',
          checked ? 'bg-scope-accent' : 'bg-scope-line',
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-3 w-3 rounded-full transition-transform',
            checked ? 'translate-x-[14px] bg-white' : 'bg-scope-ink-2',
          )}
        />
      </span>
      <span className={checked ? 'text-scope-ink' : undefined}>{label}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Checkpoint card                                                      */
/* ------------------------------------------------------------------ */

const CP_LABEL: Record<Checkpoint['kind'], string> = {
  predict: 'Checkpoint · predict',
  why: 'Checkpoint · why',
  break: 'Checkpoint · scale it',
};

function CheckpointCard({
  cp,
  answer,
  onAnswer,
  onContinue,
  onKnob,
  knobApplied,
  last,
}: {
  cp: Checkpoint;
  answer: number | undefined;
  onAnswer: (n: number) => void;
  onContinue: () => void;
  onKnob: () => void;
  knobApplied: boolean;
  last: boolean;
}) {
  const done = answer !== undefined;
  const offerKnob = cp.kind === 'break' && cp.knob && !knobApplied;
  return (
    <div className="mb-4 rounded border border-scope-cp/45 bg-scope-cp/[0.07] p-3.5">
      <p className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-scope-cp">{CP_LABEL[cp.kind]}</p>
      <p className="mb-3 text-[14px] font-medium leading-snug text-scope-ink">{cp.prompt}</p>

      {cp.kind === 'predict' ? (
        <div className="flex flex-wrap gap-1.5">
          {cp.options.map((o, k) => (
            <button
              key={k}
              disabled={done}
              onClick={() => onAnswer(k)}
              className={cn(
                'rounded border px-3 py-2 text-left font-mono text-[12.5px] text-scope-ink',
                !done && 'border-scope-line bg-scope-2 hover:border-scope-ink-3',
                done && k === cp.answer && 'border-scope-ok text-scope-ok',
                done && k === answer && k !== cp.answer && 'border-scope-fail text-scope-fail',
                done && k !== cp.answer && k !== answer && 'border-scope-line opacity-50',
              )}
            >
              {o}
            </button>
          ))}
        </div>
      ) : (
        !done && (
          <button onClick={() => onAnswer(0)} className="rounded bg-scope-ink px-3 py-2 font-mono text-[12px] font-semibold text-scope">
            Show the reasoning
          </button>
        )
      )}

      {done && (
        <div className="mt-3 text-[13.5px] leading-relaxed text-scope-ink">
          {cp.kind === 'predict' && (
            <p className={cn('mb-1.5 font-mono text-[12px] font-semibold', answer === cp.answer ? 'text-scope-ok' : 'text-scope-fail')}>
              {answer === cp.answer ? 'Correct.' : 'Not quite.'}
            </p>
          )}
          <p>{cp.reveal}</p>
          {cp.source && (
            <p className="mt-2.5 font-mono text-[11.5px] text-scope-ink-3">
              Source ·{' '}
              <a href={cp.source.url} target="_blank" rel="noopener noreferrer" className="text-scope-ink-2 underline underline-offset-2 hover:text-scope-ink">
                {cp.source.title}
              </a>
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {offerKnob && cp.kind === 'break' && cp.knob && (
              <button onClick={onKnob} className="rounded bg-scope-accent px-3 py-2 font-mono text-[12px] font-semibold text-scope">
                {cp.knob.label}
              </button>
            )}
            {!last && (
              <button
                onClick={onContinue}
                className={cn(
                  'rounded px-3 py-2 font-mono text-[12px] font-semibold',
                  offerKnob ? 'border border-scope-line text-scope-ink' : 'bg-scope-ink text-scope',
                )}
              >
                Continue
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Player                                                               */
/* ------------------------------------------------------------------ */

const SPEEDS = [0.5, 1, 2];

/**
 * Where two runs stop telling the same story — used to keep your place when a
 * knob changes. Compares narrative, not node state: a knob often changes a
 * label on every frame (a lock row reading "unused" vs "free") without
 * changing what happens, and that shouldn't throw you back to step 1.
 */
function divergence(a: Frame[], b: Frame[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    // Compare the line by its anchor, not its number: a knob that adds a line of code shifts every
    // number below it without changing which statement is running.
    if (x.say !== y.say || x.line?.anchor !== y.line?.anchor || x.checkpoint?.prompt !== y.checkpoint?.prompt) return i;
  }
  return n;
}

export function ScenarioPlayer({
  scenario,
  crumb,
  autoPlay = false,
  syncHash = false,
  onStep,
  minScale,
  maxScale,
}: {
  scenario: Scenario;
  crumb?: ReactNode;
  autoPlay?: boolean;
  /** Mirror the step into `#step-N` so a step can be linked to. */
  syncHash?: boolean;
  /** Called whenever the visible step changes. */
  onStep?: (step: number, total: number, knobs: KnobValues) => void;
  minScale?: number;
  maxScale?: number;
}) {
  const [knobs, setKnobs] = useState<KnobValues>(() => defaultKnobs(scenario));
  const frames = useMemo(() => scenario.run(knobs), [scenario, knobs]);
  const stage = useMemo(() => stageOf(scenario, knobs), [scenario, knobs]);
  const code = useMemo(() => scenario.source(knobs), [scenario, knobs]);
  const [i, setI] = useState(() => {
    if (!syncHash || typeof location === 'undefined') return 0;
    const m = /^#step-(\d+)$/.exec(location.hash);
    return m ? Math.max(0, +m[1] - 1) : 0;
  });
  const [animate, setAnimate] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<'why' | 'code'>('why');
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const root = useRef<HTMLDivElement | null>(null);
  const codeBox = useRef<HTMLPreElement | null>(null);
  const timer = useRef<number | null>(null);
  const settled = useRef(true);

  const idx = Math.min(i, frames.length - 1);
  const frame = frames[idx];
  const sig = JSON.stringify(knobs);
  const answerKey = `${sig}:${idx}`;
  const answered = answers[answerKey];
  const blocked = !!frame.checkpoint && answered === undefined;

  // Reset when a different scenario is mounted into the same player.
  const mounted = useRef(scenario);
  useEffect(() => {
    if (mounted.current === scenario) return;
    mounted.current = scenario;
    setKnobs(defaultKnobs(scenario));
    setI(0);
    setPlaying(false);
    setAnswers({});
  }, [scenario]);

  const go = useCallback(
    (k: number, withMotion: boolean) => {
      const next = Math.max(0, Math.min(frames.length - 1, k));
      setAnimate(withMotion && next === idx + 1);
      settled.current = !(withMotion && next === idx + 1);
      setI(next);
    },
    [frames.length, idx],
  );

  const stop = useCallback(() => {
    setPlaying(false);
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  // Autoplay loop: advance once packets settle, stop at checkpoints.
  const scheduleNext = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setI((cur) => {
        if (cur >= frames.length - 1) {
          setPlaying(false);
          return cur;
        }
        setAnimate(true);
        settled.current = false;
        return cur + 1;
      });
    }, 900 / speed);
  }, [frames.length, speed]);

  const onSettled = useCallback(() => {
    settled.current = true;
    if (playing && !blocked && idx < frames.length - 1) scheduleNext();
    if (playing && (blocked || idx >= frames.length - 1)) setPlaying(false);
  }, [playing, blocked, idx, frames.length, scheduleNext]);

  // Starting playback on an already-settled frame needs a kick.
  useEffect(() => {
    if (!playing) return;
    if (blocked || idx >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    if (settled.current) scheduleNext();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    if (!autoPlay) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!syncHash) return;
    try {
      history.replaceState(null, '', `#step-${idx + 1}`);
    } catch {
      /* sandboxed frames can refuse this; the step still works */
    }
  }, [idx, syncHash]);

  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  useEffect(() => {
    stepRef.current?.(idx, frames.length, knobs);
  }, [idx, frames.length, knobs]);

  useEffect(() => {
    if (tab !== 'code') return;
    codeBox.current?.querySelector('[data-hot]')?.scrollIntoView({ block: 'nearest' });
  }, [idx, tab, code]);

  const setKnob = (id: string, value: KnobValue) => {
    const nextKnobs = { ...knobs, [id]: value };
    const nextFrames = scenario.run(nextKnobs);
    const d = divergence(frames, nextFrames);
    let target = idx;
    if (idx >= d) {
      // Replay from the last checkpoint before things changed, so the learner
      // sees the new branch from the question that motivates it.
      target = d;
      for (let k = Math.min(d, nextFrames.length - 1); k >= 0; k--) {
        if (nextFrames[k].checkpoint) {
          target = k;
          break;
        }
      }
      target = Math.min(target, nextFrames.length - 1);
    }
    stop();
    setKnobs(nextKnobs);
    setAnimate(false);
    settled.current = true;
    setI(target);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest('input, textarea, select, [role="radiogroup"]')) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (playing) stop();
      else setPlaying(true);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stop();
      go(idx + 1, true);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stop();
      go(idx - 1, false);
    } else if (e.key === 'c' || e.key === 'C') {
      setTab((t) => (t === 'code' ? 'why' : 'code'));
    }
  };

  // Sticky "why": the most recent reasoning at or before this step.
  let why: string[] | undefined;
  for (let k = idx; k >= 0; k--) {
    if (frames[k].why) {
      why = frames[k].why;
      break;
    }
  }

  const pct = frames.length > 1 ? (idx / (frames.length - 1)) * 100 : 0;

  // A diagram walkthrough has no code, reasoning, metrics or checkpoints; the
  // panels that would sit empty are left out rather than drawn blank.
  const hasSide = code.length > 0 || frames.some((f) => f.why || f.checkpoint);
  const hasCheckpoints = frames.some((f) => f.checkpoint);
  const hasLegend = frames.some((f) => f.packets?.some((p) => p.kind === 'nil'));

  return (
    <div
      ref={root}
      tabIndex={0}
      onKeyDown={onKey}
      className="player overflow-hidden rounded-md border border-scope-line bg-scope text-[13px] text-scope-ink outline-none focus-visible:ring-2 focus-visible:ring-scope-accent"
      aria-label={`${scenario.title} — step-through scenario. Space plays, arrow keys step.`}
    >
      {/* ---- toolbar ---- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-scope-line bg-scope-2 px-3 py-2.5">
        <div className="min-w-0 font-mono text-[12px] text-scope-ink-2">
          {crumb ?? <span className="text-scope-ink">{scenario.title}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button className={tbtn} onClick={() => (stop(), go(idx - 1, false))} disabled={idx === 0} aria-label="Previous step">
            <Icon d={ICON.prev} />
          </button>
          <button
            className="grid h-[34px] w-[34px] place-items-center rounded border border-scope-ink bg-scope-ink text-scope"
            onClick={() => {
              if (playing) return stop();
              if (idx >= frames.length - 1) {
                go(0, false);
                setTimeout(() => setPlaying(true), 0);
                return;
              }
              setPlaying(true);
            }}
            aria-label={playing ? 'Pause' : idx >= frames.length - 1 ? 'Replay' : 'Play'}
          >
            <Icon d={playing ? ICON.pause : idx >= frames.length - 1 ? ICON.restart : ICON.play} />
          </button>
          <button className={tbtn} onClick={() => (stop(), go(idx + 1, true))} disabled={idx >= frames.length - 1} aria-label="Next step">
            <Icon d={ICON.next} />
          </button>
        </div>

        <div className="flex min-w-[200px] flex-1 basis-[240px] items-center gap-3">
          <div className="relative h-[22px] flex-1" role="group" aria-label="Steps">
            <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-scope-line" />
            <div className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-scope-ink" style={{ width: `${pct}%` }} />
            {frames.map((f, k) => {
              const left = frames.length > 1 ? (k / (frames.length - 1)) * 100 : 0;
              const now = k === idx;
              return (
                <button
                  key={k}
                  onClick={() => (stop(), go(k, false))}
                  className="group absolute top-1/2 h-[22px] w-3.5 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${left}%` }}
                  aria-label={`Step ${k + 1}${f.checkpoint ? ', checkpoint' : ''}`}
                  aria-current={now ? 'step' : undefined}
                >
                  <span
                    className={cn(
                      'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
                      f.checkpoint
                        ? cn('rotate-45 rounded-[1px] bg-scope-cp', now ? 'h-2.5 w-2.5' : 'h-2 w-2')
                        : cn('rounded-full', now ? 'h-2.5 w-2.5 bg-scope-ink ring-[3px] ring-white/10' : k < idx ? 'h-1 w-1 bg-scope-ink' : 'h-1 w-1 bg-scope-ink-3'),
                      f.checkpoint && now && 'ring-[3px] ring-scope-cp/25',
                    )}
                  />
                </button>
              );
            })}
          </div>
          <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-scope-ink-2">
            {idx + 1} / {frames.length}
          </span>
        </div>

        <button
          onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
          className="rounded border border-scope-line px-2 py-1.5 font-mono text-[12px] text-scope-ink-2 hover:text-scope-ink"
          aria-label={`Playback speed ${speed}×`}
        >
          {speed}×
        </button>

        {scenario.knobs.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {scenario.knobs.map((k) =>
              k.kind === 'toggle' ? (
                <Toggle
                  key={k.id}
                  id={`${scenario.id}-${k.id}`}
                  label={k.label}
                  checked={knobs[k.id] === true}
                  onChange={(v) => setKnob(k.id, v)}
                />
              ) : k.options.length <= 4 ? (
                // A few options: show them all, so the alternatives are visible rather than hidden in a menu.
                <div key={k.id} className="flex items-center gap-2 font-mono text-[12px] text-scope-ink-2">
                  <span id={`${scenario.id}-${k.id}-label`}>{k.label}</span>
                  <div role="radiogroup" aria-labelledby={`${scenario.id}-${k.id}-label`} className="flex rounded border border-scope-line p-0.5">
                    {k.options.map((o) => {
                      const on = String(knobs[k.id]) === o.value;
                      return (
                        <button
                          key={o.value}
                          role="radio"
                          aria-checked={on}
                          onClick={() => setKnob(k.id, o.value)}
                          className={cn(
                            'whitespace-nowrap rounded-[3px] px-2 py-1',
                            on ? 'bg-scope-ink text-scope' : 'text-scope-ink-2 hover:text-scope-ink',
                          )}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <label key={k.id} className="flex items-center gap-2 font-mono text-[12px] text-scope-ink-2">
                  {k.label}
                  <select
                    id={`${scenario.id}-${k.id}`}
                    value={String(knobs[k.id])}
                    onChange={(e) => setKnob(k.id, e.target.value)}
                    className="rounded border border-scope-line bg-scope px-1.5 py-1 text-scope-ink"
                  >
                    {k.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ),
            )}
          </div>
        )}
      </div>

      {/* ---- body ---- */}
      <div className={cn('player-body', !hasSide && 'player-body--solo')}>
        <div className="player-stage min-w-0">
          <div className="relative overflow-x-auto">
            <Stage
              spec={stage}
              frame={frame}
              animate={animate}
              speed={speed}
              onSettled={onSettled}
              minScale={minScale}
              maxScale={maxScale}
            />
          </div>

          {frame.metrics.length > 0 && (
          <div className="grid grid-cols-2 border-t border-scope-line sm:grid-cols-4">
            {frame.metrics.map((m, k) => (
              <div key={m.label} className={cn('min-w-0 border-scope-line px-3 py-2.5', k % 2 === 0 && 'border-r', k % 4 === 1 && 'sm:border-r', k >= 2 && 'border-t sm:border-t-0')}>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-scope-ink-3">{m.label}</div>
                <div className="mt-1 truncate font-mono text-[16px] font-medium tabular-nums" style={{ color: m.tone && m.tone !== 'idle' ? TONE[m.tone] : undefined }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>
          )}

          <p className="min-h-[68px] border-t border-scope-line px-4 py-3 text-[14px] leading-relaxed" aria-live="polite">
            <span className="mr-2 font-mono text-[12px] font-semibold tabular-nums text-scope-cp">{String(idx + 1).padStart(2, '0')}</span>
            {frame.say}
          </p>

          {hasLegend && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-scope-line px-3 py-2 font-mono text-[11.5px] text-scope-ink-3">
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-full bg-scope-accent" /> request or command
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-full bg-scope-ok" /> hit or success
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-full border-[1.5px] border-scope-ink-2" /> miss or nil
            </span>
            {hasCheckpoints && (
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2 w-2 rotate-45 rounded-[1px] bg-scope-cp" /> checkpoint
              </span>
            )}
          </div>
          )}
        </div>

        {hasSide && (
        <div className="player-side flex min-w-0 flex-col">
          <div className="flex border-b border-scope-line" role="tablist">
            {(['why', 'code'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  'border-b-2 px-4 pb-2.5 pt-3 font-mono text-[12px]',
                  tab === t ? 'border-scope-ink text-scope-ink' : 'border-transparent text-scope-ink-2 hover:text-scope-ink',
                )}
              >
                {t === 'why' ? 'Why' : 'Code'}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1" role="tabpanel">
            {tab === 'why' ? (
              <div className="max-h-[440px] overflow-y-auto p-4 text-[13.5px] leading-relaxed">
                {frame.checkpoint && (
                  <CheckpointCard
                    cp={frame.checkpoint}
                    answer={answered}
                    last={idx >= frames.length - 1}
                    onAnswer={(n) => setAnswers((a) => ({ ...a, [answerKey]: n }))}
                    onContinue={() => {
                      go(idx + 1, true);
                      setTimeout(() => setPlaying(true), 0);
                    }}
                    knobApplied={frame.checkpoint.kind === 'break' && !!frame.checkpoint.knob && knobs[frame.checkpoint.knob.id] === frame.checkpoint.knob.value}
                    onKnob={() => {
                      const cp = frame.checkpoint;
                      if (cp?.kind === 'break' && cp.knob) setKnob(cp.knob.id, cp.knob.value);
                    }}
                  />
                )}
                {why && (
                  <>
                    <p className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-scope-ink-3">Why this matters</p>
                    {why.map((p, k) => (
                      <p key={k} className="mb-2.5 text-scope-ink">
                        {p}
                      </p>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <>
                <pre ref={codeBox} className="max-h-[400px] overflow-auto py-2.5 font-mono text-[12.5px] leading-[1.75]">
                  {code.map((l, k) => {
                    const hot = frame.line?.n === k + 1;
                    const ann =
                      hot && frame.vars && Object.keys(frame.vars).length
                        ? '  // ' + Object.entries(frame.vars).map(([a, b]) => `${a} = ${b}`).join(', ')
                        : '';
                    return (
                      <span
                        key={k}
                        data-hot={hot ? '' : undefined}
                        className={cn(
                          'block whitespace-pre pr-4',
                          hot ? 'bg-[#FFD66B14] text-scope-ink shadow-[inset_2px_0_0_#F2B632]' : 'text-scope-ink-2',
                        )}
                      >
                        <span className={cn('inline-block w-[38px] select-none pr-3 text-right', hot ? 'text-scope-cp' : 'text-scope-ink-3')}>{k + 1}</span>
                        <span dangerouslySetInnerHTML={{ __html: highlight(l) || ' ' }} />
                        {ann && <span className="text-scope-cp/90">{ann}</span>}
                      </span>
                    );
                  })}
                </pre>
                <div className="border-t border-scope-line px-4 py-2.5 font-mono text-[12px] leading-relaxed text-scope-ink-2">
                  {frame.vars && Object.keys(frame.vars).length ? (
                    Object.entries(frame.vars).map(([a, b], k) => (
                      <span key={a}>
                        {k > 0 && <span className="text-scope-ink-3"> · </span>}
                        {a} = <b className="font-medium text-scope-ink">{b}</b>
                      </span>
                    ))
                  ) : (
                    <span className="text-scope-ink-3">{frame.line ? 'no live variables at this step' : 'no line executing at this step'}</span>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-scope-line px-4 py-2.5 font-mono text-[11px] text-scope-ink-3">
            <span>
              <kbd className="mr-1 rounded-sm border border-scope-line px-1 text-scope-ink-2">Space</kbd>play
            </span>
            <span>
              <kbd className="mr-1 rounded-sm border border-scope-line px-1 text-scope-ink-2">←</kbd>
              <kbd className="mr-1 rounded-sm border border-scope-line px-1 text-scope-ink-2">→</kbd>step
            </span>
            <span>
              <kbd className="mr-1 rounded-sm border border-scope-line px-1 text-scope-ink-2">C</kbd>code
            </span>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
