# 04 — Diagram Strategy

## Library evaluation (open-source constraint)

| Library | License | Verdict | Reasoning against our needs (Alex Xu-style architectures, numbered data flows, tiers, interactivity) |
|---|---|---|---|
| **React Flow (`@xyflow/react` v12)** | MIT | ✅ **CHOSEN** | Graph model is literally `nodes[] + edges[]` JSON → 1:1 mapping to our stored schema. Custom nodes are plain React components (each icon node = one tiny file = one atomic task for a small model). Built-in pan/zoom/fit-view/minimap, edge labels, dashed & colored edges, parent/child **subflows** for Xu's dashed "Web tier / Data tier" boxes, per-edge styling for step-through highlighting. |
| Mermaid.js | MIT | ❌ renderer / ✅ inspiration | Text-to-SVG, layout is auto-computed — cannot reproduce Xu's deliberate spatial compositions; interactivity limited to click callbacks; no per-step flow animation; styling custom icon nodes is fragile. |
| D3.js | ISC | ❌ | Unlimited power but zero structure: every diagram would be bespoke imperative code — the worst possible surface for smaller AI models (high bug rate, no shared schema). |
| Excalidraw | MIT | ❌ | Whiteboard editor with a drawing-centric data model (freeform shapes, no typed nodes/edges semantics). Great for humans sketching, wrong for schema-driven rendering + programmatic highlighting. |
| JointJS | MPL 2.0 (core) | ❌ | Capable, but the useful features live in the commercial JointJS+; core is less documented in model training data than React Flow. |

**Decision: React Flow.** Every diagram is data (`InteractiveDiagram` JSON, schema in docs/02 §3); the renderer (`DiagramCanvas`) converts it to React Flow props. Diagrams are read-only canvases (pan/zoom only, `nodesDraggable={false}`) with two interactive layers: hover tooltips per node, and the **Flow Stepper** that walks numbered request flows.

## Visual vocabulary (extracted from the book's figures 1-1 … 1-19)

The book's diagrams use a consistent, minimal language. Our node catalog reproduces the *language* with our own icons (lucide-react, ISC license) — no book artwork is copied.

| `NodeKind` | Book visual | Our rendering (icon = lucide-react) | Color token |
|---|---|---|---|
| `client` | laptop "Web browser" | `Monitor` icon, label below | slate-700 |
| `client_mobile` | phone "Mobile app" | `Smartphone` | slate-700 |
| `dns` | globe "DNS" | `Globe` | slate-600 |
| `cdn` | cloud+bolt "CDN" | `Cloud` | sky-400 |
| `load_balancer` | blue box w/ arrows | `Network` on blue rounded square | blue-600 |
| `server` | green server rack | `Server`, green | green-600 |
| `server_stack` | 3 overlapping green racks | `Server` + two offset ghost rects behind | green-600 |
| `database` | blue cylinder "DB" | `Database`, blue | blue-600 |
| `database_stack` | stacked cylinders | `Database` + ghost rects | blue-600 |
| `nosql` | cylinder with `{ }` | `Braces` on cylinder outline | blue-700 |
| `cache` | blue square "CACHE" | `Zap` on blue rounded square | blue-500 |
| `cache_stack` | overlapping CACHE squares | `Zap` + ghost rects | blue-500 |
| `message_queue` | envelopes in arrow box | `Mail` inside arrow-shaped border | blue-600 |
| `worker_stack` | green racks "Workers" | `Cpu` + ghost rects, green | green-600 |
| `service` | solid blue rounded rect w/ white text | filled blue rounded rect, white label | blue-600 |
| `text_box` | plain annotation / tools panel | bordered rect, plain text | purple-600 outline |
| `table` | domain→IP lookup table | HTML `<table>` from `tableData` | slate |

Shared node anatomy (`components/diagram/nodes/BaseNode.tsx`): 4 invisible connection handles (top/bottom/left/right, ids = `"top" | "bottom" | "left" | "right"`), icon box, `label` under the icon, optional smaller gray `sublabel`, optional circled-number `badge` (①), and `state` styling: `highlighted` = blue ring, `failed` = red ✗ overlay + red ring, `dimmed` = 25% opacity (matches the book's DC-failover figure).

Edge anatomy (`components/diagram/edges/LabeledEdge.tsx`): bezier path; `color` maps to {blue:#2563eb, green:#16a34a, purple:#7c3aed, red:#dc2626, gray:#94a3b8}; `lineStyle:"dashed"` → `strokeDasharray:"6 4"`; `direction` sets arrowheads (`forward` = target arrow, `both` = both, `none` = none); label pill mid-edge shows optional `step` in a circle + `label` text — exactly the "② 15.125.23.214" pattern from the book.

**Authoring rule for handles:** nodes expose *source* handles only on `bottom`/`right` and *target* handles only on `top`/`left`. So `edge.sourceHandle` ∈ {`bottom`,`right`} and `edge.targetHandle` ∈ {`top`,`left`} (the validator enforces this). For visually upward/backward arrows, draw the edge from the upper/left node and use `direction: "both"` or `"none"`.

Groups: rendered as React Flow nodes of type `group` behind children — `dashed` (tiers: "Web tier", "Data tier"), `solid` (the "User" device box), `filled` (gray data-center regions "DC1 US-East").

## Interactivity model

1. **Explore mode (default):** pan/zoom; hovering a node shows a tooltip with `sublabel`; nothing is editable.
2. **Flow mode:** if the diagram has `flows`, a stepper panel lists them. Selecting a flow + stepping (Next/Prev/keyboard ←→) sets edges in the current step's `edgeIds` to animated+highlighted, dims all other edges/nodes (nodes touched by highlighted edges stay full opacity), and shows the step's `text`. Finishing the last step fires `PUT /api/progress/diagram/:id { viewed: true }`.

## Manual authoring workflow (book concept → our JSON)

For each book figure worth recreating (roughly 3–6 per chapter):

1. **Study** the figure in the PDF. List components, tiers, and the numbered flow it narrates. *(Human/planning-model step — the PDF never enters the codebase.)*
2. **Name it:** file `content/diagrams/<sourceSlug>__<chapterSlug>__<sectionSlug>/<diagramSlug>.json` (this path convention tells the seeder which section owns it).
3. **Author JSON** against the schema: pick `NodeKind`s from the catalog; lay out on a mental grid (grid unit = 40px; canvas ~1000×800; flow top→bottom like the book); wrap tiers in `groups`; label edges; encode the figure's numbered narrative as one or more `flows`.
4. **Validate:** `npm run validate:diagrams` (ajv against `scripts/diagram.schema.json`).
5. **Preview:** open `/diagram-preview?file=<path>` in the dev client, compare against the concept, adjust positions.
6. **Seed & commit:** `npm run seed`, commit the JSON file.

## Reference example (recreates the *concept* of the classic "LB + web tier + data tier" architecture, book Fig 1-6)

`content/diagrams/sdi-vol1-2e__scale-to-millions__overview/web-data-tier.json` *(this exact file is committed in the repo as the reference implementation)*

```json
{
  "schemaVersion": 1,
  "id": "web-data-tier",
  "title": "Web tier + data tier with load balancer and replication",
  "description": "Users resolve DNS, hit the load balancer, which fans out to stateless web servers backed by master-slave replication.",
  "groups": [
    { "id": "g_user", "label": "User",     "position": { "x": 280, "y": 0 },   "size": { "width": 360, "height": 150 }, "style": "solid" },
    { "id": "g_web",  "label": "Web tier", "position": { "x": 280, "y": 420 }, "size": { "width": 360, "height": 160 }, "style": "dashed", "labelPosition": "right" },
    { "id": "g_data", "label": "Data tier","position": { "x": 240, "y": 680 }, "size": { "width": 440, "height": 170 }, "style": "dashed", "labelPosition": "right" }
  ],
  "nodes": [
    { "id": "browser", "type": "client",        "label": "Web browser", "position": { "x": 40, "y": 40 },  "groupId": "g_user" },
    { "id": "mobile",  "type": "client_mobile", "label": "Mobile app",  "position": { "x": 220, "y": 40 }, "groupId": "g_user" },
    { "id": "dns",     "type": "dns",           "label": "DNS",          "position": { "x": 800, "y": 40 } },
    { "id": "lb",      "type": "load_balancer", "label": "Load balancer","position": { "x": 420, "y": 260 } },
    { "id": "web1",    "type": "server",        "label": "Server 1",     "position": { "x": 50, "y": 40 },  "groupId": "g_web" },
    { "id": "web2",    "type": "server",        "label": "Server 2",     "position": { "x": 210, "y": 40 }, "groupId": "g_web" },
    { "id": "master",  "type": "database",      "label": "Master DB", "sublabel": "writes", "position": { "x": 50, "y": 50 },  "groupId": "g_data" },
    { "id": "slave",   "type": "database",      "label": "Slave DB",  "sublabel": "reads",  "position": { "x": 280, "y": 50 }, "groupId": "g_data" }
  ],
  "edges": [
    { "id": "e_dns",    "source": "browser", "target": "dns",    "label": "www.mysite.com", "step": 1, "sourceHandle": "right", "targetHandle": "left", "direction": "both" },
    { "id": "e_lb",     "source": "browser", "target": "lb",     "label": "HTTP request",   "step": 2, "sourceHandle": "bottom", "targetHandle": "top" },
    { "id": "e_w1",     "source": "lb",      "target": "web1",   "step": 3, "sourceHandle": "bottom", "targetHandle": "top" },
    { "id": "e_w2",     "source": "lb",      "target": "web2",   "step": 3, "sourceHandle": "bottom", "targetHandle": "top" },
    { "id": "e_write",  "source": "web1",    "target": "master", "label": "write", "color": "blue",  "sourceHandle": "bottom", "targetHandle": "top" },
    { "id": "e_read",   "source": "web2",    "target": "slave",  "label": "read",  "color": "green", "sourceHandle": "bottom", "targetHandle": "top" },
    { "id": "e_repl",   "source": "master",  "target": "slave",  "label": "replicate", "lineStyle": "dashed", "color": "gray", "sourceHandle": "right", "targetHandle": "left" }
  ],
  "flows": [
    {
      "id": "read-request",
      "name": "A user reads data",
      "steps": [
        { "edgeIds": ["e_dns"],  "text": "The browser resolves www.mysite.com via DNS and receives the load balancer's public IP." },
        { "edgeIds": ["e_lb"],   "text": "The HTTP request goes to the load balancer — web servers are not reachable directly." },
        { "edgeIds": ["e_w1", "e_w2"], "text": "The load balancer forwards the request to a healthy web server over private IPs." },
        { "edgeIds": ["e_read"], "text": "The web server reads from a slave replica; reads scale by adding replicas." },
        { "edgeIds": ["e_repl"], "text": "The master asynchronously replicates writes to slaves in the background." }
      ]
    }
  ]
}
```
