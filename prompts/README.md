# Content review prompt pack

This folder is a browser-assisted editorial workflow for improving the system-design lessons.
It is designed for small models that can read local files and open web pages, but cannot be trusted
to remember technical facts reliably.

## Review order

1. Read [`resource-registry.json`](./resource-registry.json).
2. Read [`lesson-review-map.json`](./lesson-review-map.json) and select the target topic and section.
3. Read the lesson from `content/curriculum.json`. For authored sections, also read the file named by
   `contentRef`; for Primer sections, treat the generated content as attributed source material.
4. Use one of the templates under `templates/`.
5. Return JSON that validates against [`schemas/review-result.schema.json`](./schemas/review-result.schema.json).
6. Never silently edit the lesson. Return evidence, proposed changes, and replacement prose separately.

## Source policy

The registry deliberately separates source roles:

- `normative`: standards and protocol specifications. Use these for protocol behavior and terminology.
- `authoritative`: official project, vendor, publisher, research-paper, and Google SRE documentation. Use
  these for implementation behavior, operating guidance, and deep technical explanations.
- `interview`: System Design Primer and ByteByteGo. Use these for interview framing, common prompts,
  diagrams, and breadth—not as the final authority for product behavior.

Prefer the narrowest source that directly supports the claim. A vendor document can establish what that
vendor's product does, but not what every database or cloud provider does. Label vendor-specific behavior.

The browser model must:

- cite the source URL and registry ID for every material correction;
- report conflicts instead of choosing silently;
- distinguish facts, rules of thumb, and inferences;
- include the page's publication/update date when available;
- avoid long quotations and never copy proprietary book or course text;
- mark a claim `unverified` when the allowed sources do not support it.

## Templates

- `01-fact-check.md` — verify claims and calculations without rewriting the lesson.
- `02-gap-review.md` — find missing concepts, follow-ups, and failure modes.
- `03-rewrite-lesson.md` — produce a corrected, original lesson draft with citations.
- `04-interview-readiness.md` — assess whether a learner can use the lesson in a timed interview.
- `05-diagram-review.md` — verify one interactive diagram: edge direction, step order, step/edge
  agreement, coverage, and label arithmetic.

## Diagrams

Diagrams make claims the same way prose does, so they need their own pass. Every diagram is listed
under its topic in `lesson-review-map.json` as `diagrams[]`, with its owning section and flow ids.

The defect that matters most is not a wrong fact — it is a **step whose narration explains one thing
while highlighting another**, which teaches the reader the wrong association. Two related defects are
an edge that is drawn but never walked (an unsupported claim left on the canvas), and a step that
repeats its predecessor's highlight (prose wearing a step's clothing). `05-diagram-review.md` checks
all three explicitly.

## Recommended execution

Run `01-fact-check` and `02-gap-review` first. Only use `03-rewrite-lesson` after the evidence is
accepted. Run `04-interview-readiness` after the lesson and its practice prompt exist.

The prompts are deliberately conservative: they improve quality through traceable evidence, not by
asking a small model to make the prose sound more confident.
