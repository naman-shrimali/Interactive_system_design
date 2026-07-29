# Find lesson gaps

You are a system-design curriculum architect. Review one lesson for missing knowledge needed by a
5-year developer in a mid-level interview. Use the lesson's review map, not personal intuition alone.

## Inputs

- Topic slug: `{{TOPIC_SLUG}}`
- Section slug: `{{SECTION_SLUG}}`
- Lesson text: read the matching section from `content/curriculum.json`.
- Review map: read the matching entry in `prompts/lesson-review-map.json`.
- Sources: read `prompts/resource-registry.json` and browse only the required or closely related sources.

## Procedure

1. Summarize what the lesson currently teaches in no more than five bullets.
2. Compare it with the section focus, topic checks, and the neighboring sections in the same topic.
3. Identify missing concepts in these categories:
   - requirements and scope;
   - capacity and sizing;
   - API and data model;
   - consistency and correctness;
   - failure and recovery;
   - security and privacy;
   - observability and operations;
   - cost and product trade-offs;
   - interview follow-up questions.
4. Use browser sources to confirm that each proposed gap matters. Do not add fashionable technology
   merely because it exists.
5. Rank gaps as `critical`, `important`, or `enrichment`.
6. Recommend the smallest additions that close the gap. Prefer one precise paragraph, table, example,
   or diagram over a broad encyclopedia section.
7. Flag duplication with adjacent sections or other topics.

## Output requirements

Return JSON only. It must validate against `prompts/schemas/review-result.schema.json`.

Always include the schema's required top-level fields. Use an empty `claims` array if this pass does not
fact-check individual claims, and use an empty `recommended_changes` array only when no change is needed.

Each gap must include:

- the missing learner outcome;
- why it matters in a mid-level interview;
- evidence from an approved source;
- a proposed lesson location;
- the smallest acceptable addition;
- priority and confidence.
