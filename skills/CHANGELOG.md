# Skills Changelog

All notable changes to the bundled `skills/` directory.

The bundle ships as a single versioned unit (semver in `skills/VERSION`).
No per-skill versions — bump-skill-versions patch-bumps the bundle when
any file under `skills/<name>/**` changes.

## [0.3.0] — 2026-06-23

Read surface picked up four more MCP tools and two new workflow
skills; existing skills updated to point at them. Minor bundle bump
— no breaking changes.

### MCP tools (now live in `src/mcp/mcp.service.ts`)

- `memory_diff` — "what changed between two ISO 8601 cursors"
  surface. Returns createdFacts / retractedFacts / changedFacts (with
  before+after) / newEntities / forgottenEntities for `[from, to)`.
  Killer use case: session-resume agents fetch
  `memory_diff(lastSessionEnd, now)` and brief the user on what brain
  learned while they were away. Read scope.
- `get_competing_facts` — list facts in COMPETING status for an
  entity, grouped by predicate. 2-fact groups are resolver-left
  pairs; 3+ groups are multi-way conflicts escalated for human
  review. Drives in-product reviewer queues. Read scope.
- `detect_contradiction` — read-only dry-run of `fn::resolve_fact`.
  Predicts INSERTED / SUPERSEDED / COMPETING / REJECTED for a
  candidate fact without writing. Use as preflight before
  `record_fact` when contested writes are expensive. Read scope.
- `summarize_entity` — one-line briefing about an entity
  (name + top facts + refs), in-process LRU-cached. Saves three
  round-trips vs `get_entity_profile` + `get_entity_timeline` +
  `get_competing_facts` when all the agent needs is a single line of
  context. Three styleHint registers (`neutral` / `sales` /
  `support`); v1 is template-rendered, LLM-backed generator behind a
  feature flag is the next step. Read scope.

### Skill updates

- `brain-recall` — adds `summarize_entity` as the one-line briefing
  short-circuit + `get_competing_facts` for unresolved disagreements.
  Question/tool matrix expanded to five columns.
- `brain-bitemporal` — new section on `memory_diff` as the canonical
  "what changed since X" surface; mentions `asOf` on
  `search_multi_hop`; new "when did we first learn this" subsection.
- `brain-search` — companion-tool list updated.
- `brain-mcp-setup` — Aider / Goose v2 / Continue.dev / raw
  `@modelcontextprotocol/sdk` client configs added; scope matrix
  expanded to the full 14-tool surface.

### New skills

- `brain-write` — record_fact / link_entities / retract_fact with
  confidence picking, identity_of cycle guards, and the retract-vs-
  forget decision. Pairs `detect_contradiction` as preflight.
- `brain-conflict` — COMPETING fact status, get_competing_facts,
  detect_contradiction preflight, and the human-in-the-loop
  adjudication workflow. Covers 2-fact pairs vs 3+ multi-way
  conflicts and the dreams resolver's auto-resolution path.

## [0.2.0] — 2026-06-23

MCP surface picked up four new tools — skills point at them. Minor
update across `brain-search`; no breaking changes to existing skill
behaviour.

### MCP tools (now live in `src/mcp/mcp.service.ts`)

- `search_multi_hop` — planner-LLM-driven chained search with the
  running entity set anchored across hops. Use for questions that
  combine evidence across turns / sessions ("tenants who complained
  in April AND upgraded after"). Read scope.
- `synthesize` — corrective-RAG with the strict / lenient / off
  guardrail trio + claim-level faithfulness verifier. Read scope.
- `link_entities` — declare a typed edge between two entities. The
  `identity_of` kind merges two records of the same person across
  verticals; other kinds (`paid_for`, `mentioned_in`, …) participate
  in PPR / SubgraphRAG context. Write scope.
- `forget_entity` — GDPR-grade hard cascade with an HMAC tombstone.
  Reason enum is locked (`gdpr_request` / `tenant_offboarding` /
  `operator_request`); requestId is required for the audit trail.
  Admin scope.

### Skill updates

- `brain-search` — calls out when to escalate to `search_multi_hop`
  vs `synthesize` vs the one-shot `search_knowledge`; companion-
  tool list now includes the four new tools.

## [0.1.0] — 2026-05-22

Initial brain skills bundle.

### New skills

- `brain-search` — semantic + bitemporal search workflow for AI agents
- `brain-recall` — entity profile + timeline + connections workflow
- `brain-bitemporal` — formulating `asOf` queries and reading retracted facts
- `brain-mcp-setup` — connect a new MCP client to brain (Claude Desktop / Cursor / Goose)
