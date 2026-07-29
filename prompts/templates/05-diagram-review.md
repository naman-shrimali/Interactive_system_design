# Review an interactive diagram

You are a conservative technical editor reviewing one diagram, not a lesson. A diagram makes claims
the same way prose does — through what it draws, what it labels, and what order it walks. Verify those
claims. Do not redraw the diagram in this pass.

## Inputs

- Topic slug: `{{TOPIC_SLUG}}`
- Diagram slug: `{{DIAGRAM_SLUG}}`
- Spec: read `content/diagrams/{{TOPIC_SLUG}}/{{DIAGRAM_SLUG}}.json`.
- Owning lesson: read the section in `content/curriculum.json` whose `diagrams` array names this slug.
- Review map entry: read `prompts/lesson-review-map.json`.
- Approved sources: read `prompts/resource-registry.json`.

## What a diagram claims

Check each of these separately. Most diagram defects are not wrong facts — they are correct facts
assembled into a picture that implies something false.

1. **Node claims.** Does each node exist in the design being described, and is its label the term the
   approved sources use? Flag invented components and vendor names presented as generic roles.
2. **Edge claims.** Does the arrow's direction match the real flow of data or control? An edge drawn
   `A → B` asserts A initiates. Verify against the protocol or the product's documented behavior.
3. **Step order.** Walk `flows[].steps` in order and ask whether a real request could occur in that
   sequence. Look for steps that assume a result the previous step has not produced yet.
4. **Step/edge agreement.** For every step, does the narration describe the edges in `edgeIds`? A step
   whose text explains one thing while highlighting another teaches the reader the wrong association.
   This is the single most common defect.
5. **Coverage.** Is every edge referenced by at least one step? An edge that is drawn but never walked
   is an unsupported claim sitting on the canvas.
6. **Progression.** Does each step change the highlighted set? A step that repeats its predecessor's
   `edgeIds` freezes the picture while the text advances, so it is prose, not a step.
7. **Labels and numbers.** Recalculate every figure shown in a `table` node or a `sublabel`. Confirm
   units. Confirm that any figure also stated in the owning lesson matches.
8. **Failure states.** If a node uses `state: "failed"` or an edge is dashed/red, does the narration
   explain what failed and what the reader should conclude? Decorative failure is misleading.
9. **Scope honesty.** Does the diagram imply universality where the behavior is vendor-specific or
   configuration-dependent? Label it if so.

## Procedure

1. Read the spec and the owning lesson section together. A diagram that contradicts its own lesson is a
   defect in one of the two — report both sides, do not pick silently.
2. For each material claim, open the narrowest approved source. Prefer normative, then authoritative,
   then interview sources.
3. Recompute all arithmetic yourself and show the calculation in the evidence field.
4. Simulate the walkthrough. For each step, state which edges light up and whether the narration
   matches. Report mismatches as `misleading`, not `unsupported` — the fact may be true while the
   pairing is wrong.
5. Do not treat visual clarity as correctness. A clean diagram can still teach something false.

## Output requirements

Return JSON only, validating against `prompts/schemas/review-result.schema.json`.

- Use `lesson.topic_slug` for the topic and put the diagram slug in `lesson.section_slug`.
- Classify diagram-specific findings using the existing `classification` values; use `protocol` for edge
  direction and handshake claims, `calculation` for table and label arithmetic, and `tradeoff` for
  claims about when a design is appropriate.
- Put step/edge mismatches, orphan edges, and frozen steps in `recommended_changes`, each naming the
  flow id and step index.
- If the diagram is correct but the owning lesson is not, say so explicitly in `summary`.
