import { useAppStore } from '../store/useAppStore';

export function HomePage() {
  const curriculum = useAppStore((s) => s.curriculum);

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Interactive System Design</h1>
      <p className="text-slate-500 mb-8">
        Learn large-scale system design interactively. Browse the curriculum in the sidebar, work
        through interactive diagrams, complete external resources, and take notes as you go.
      </p>

      {curriculum && (
        <div className="grid gap-4 sm:grid-cols-2">
          {curriculum.map((source) => {
            const chapters = source.chapters.length;
            const sections = source.chapters.reduce((n, c) => n + c.sections.length, 0);
            return (
              <div key={source.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-semibold text-slate-800">{source.title}</h2>
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                    {source.kind}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mb-2">{source.description}</p>
                <p className="text-xs text-slate-400">
                  {chapters} chapters · {sections} sections
                </p>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-xs text-slate-400">
        Text content from The System Design Primer (MIT) © Donne Martin. Interactive diagrams are
        original works inspired by system design concepts.
      </p>
    </div>
  );
}
