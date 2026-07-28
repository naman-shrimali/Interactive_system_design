# TASK-012: Section reader page (markdown rendering)

> ⚠️ **SUPERSEDED — historical record, not a specification.** This task shipped, but against
> schema v1 (`sources → chapters → sections`) and the pre-redesign UI. Its DDL, API shapes, and
> component names no longer match the code. For current contracts see
> [docs/02-data-models.md](../docs/02-data-models.md); see [tasks/README.md](README.md) for status.


## Objective
Replace the SectionPage placeholder with the real reader: fetched section detail rendered as styled markdown with breadcrumb and attribution footer.

## Prerequisites
TASK-011 (routing + placeholder page), TASK-006 (section API).

## Context
Primer content is GitHub-flavored markdown with tables and absolute image URLs (rewritten during ingestion). Render with react-markdown + remark-gfm; raw HTML in markdown stays **disabled** (react-markdown's default — do not add rehype-raw).

## Files to create
```
client/src/components/reader/MarkdownView.tsx
```
## Files to modify
```
client/src/pages/SectionPage.tsx
client/tailwind.config.js       (add typography plugin)
client/package.json             (npm i -D @tailwindcss/typography)
```

## Data contract
Page state machine: `{ phase: 'loading' } | { phase: 'error', message } | { phase: 'ready', section: SectionDetail }`. Re-fetch whenever `useParams().id` changes (`useEffect` keyed on id).

## Steps
1. Install `@tailwindcss/typography`; add `require('@tailwindcss/typography')` to `plugins` in `tailwind.config.js`.
2. `MarkdownView.tsx`:
   ```tsx
   import ReactMarkdown from 'react-markdown';
   import remarkGfm from 'remark-gfm';

   export function MarkdownView({ markdown }: { markdown: string }) {
     return (
       <div className="prose prose-slate max-w-none prose-img:max-w-full prose-pre:overflow-x-auto">
         <ReactMarkdown
           remarkPlugins={[remarkGfm]}
           components={{
             a: ({ href, children }) => (
               <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
             ),
           }}
         >
           {markdown}
         </ReactMarkdown>
       </div>
     );
   }
   ```
3. `SectionPage.tsx`:
   - Parse `id` from params (`Number`); fetch via `fetchSection(id)`; handle the three phases (spinner text / red error box / content).
   - Ready layout, top to bottom:
     - breadcrumb: `{sourceSlug === 'primer' ? 'Primer' : 'Book'} › {chapterTitle} › {title}` in small gray text
     - `<h1>` section title
     - `<MarkdownView markdown={section.contentMarkdown} />` — if `contentMarkdown` is empty (book scaffold sections), show an italic gray placeholder: "No text content — this book section is diagram-driven. Original summaries only; see the interactive diagrams below."
     - footer `<hr>` + small text: when `sourceUrl` is non-null render `Source: <a href={sourceUrl}>system-design-primer</a> (MIT © Donne Martin)`.
   - Leave two clearly-marked placeholder slots (empty fragments with comments) where later tasks mount panels: `{/* TASK-013: LinksPanel */}`, `{/* TASK-016: NotesPanel */}`, `{/* TASK-024: diagrams */}`.

## Acceptance criteria
- [ ] `npx tsc --noEmit` passes.
- [ ] Navigating to a primer section shows formatted markdown: headings, bullet lists, and tables render styled (verify on a section containing a table, e.g. the CAP/consistency content).
- [ ] Images load (primer sections with diagrams show the GitHub-hosted PNGs).
- [ ] All links open in a new tab.
- [ ] A book section (empty content) shows the italic placeholder, not a blank page.
- [ ] Switching sections via the sidebar re-fetches (title changes without a full reload); unknown id shows the error phase.
- [ ] Primer sections show the MIT attribution footer; book sections show no footer.

## Out of scope
External-links panel (TASK-013), progress controls (TASK-014), notes (TASK-016), diagram embedding (TASK-024).
