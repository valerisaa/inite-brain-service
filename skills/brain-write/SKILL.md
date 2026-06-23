---
name: brain-write
description: How to write to the INITE Brain knowledge graph from an agent loop — record_fact, link_entities, retract_fact, and the detect_contradiction preflight. Covers confidence picking, retract vs forget semantics, identity_of cycle-guards. Use when the user explicitly wants to record, merge, or revise structured knowledge from a conversation (not when they're just asking a question).
---

# brain-write

The write surface is small but consequential — every fact you record gets scored by the conflict resolver, may supersede or compete with existing facts, and stays in the audit trail forever. This skill covers when to reach for each tool and how to set the inputs so the resolver does what you mean.

## When to use

- The user says "remember that …" / "make a note that …" / "let's record …" → `record_fact`
- A fact you have on hand says "X is the same person as Y" → `link_entities` with `kind: identity_of`
- A typed edge between two known entities (`paid_for`, `mentioned_in`, `worked_with`, …) → `link_entities`
- Something brain previously believed is now known to be wrong → `retract_fact`
- "Before I save this, would it conflict with anything?" → `detect_contradiction`

Do **not** use for:
- Bulk ingest from a vertical's event stream — that's a /v1/ingest path, not an agent loop
- GDPR-grade hard delete → `forget_entity` (admin scope; see `brain-mcp-setup`)

All write tools require the `brain:write` scope on the API key. `forget_entity` requires `brain:admin`.

## record_fact — recording one fact

```ts
record_fact({
  entityRef: { vertical: "rent", id: "cust_42" }, // or { entityId: "..." }
  predicate: "tier",
  object: "platinum",
  validFrom: "2026-05-01T00:00:00Z",
  validUntil: undefined,            // optional — leave open-ended unless the user said "until X"
  confidence: 0.9,                  // 0..1
  sourceVertical: "rent",
})
```

### Picking confidence

The conflict resolver scores each candidate against existing facts using `confidence × CONFLICT_WEIGHT_CONFIDENCE + sourceTrust × CONFLICT_WEIGHT_SOURCE_TRUST + recency + authority`. Confidence is the per-fact axis you control; pick it honestly:

| Situation | confidence |
| --- | --- |
| User said "Alice is platinum tier" explicitly | 0.9 — 1.0 |
| Inferred from LLM extraction over a transcript | 0.5 — 0.7 |
| System observation (counted event, signed signature) | 0.95 — 1.0 |
| Vague phrasing ("I think she's gold?") | 0.3 — 0.5 |

A confidence of 1.0 implies a system-grade ground truth source — don't claim it for an LLM extraction.

### Preflight with detect_contradiction

When the cost of a contested write is high (e.g. agent loops that pay an ingest credit, or actions that would surface a CHANGED notification), check first:

```ts
detect_contradiction({
  entityRef:    { vertical: "rent", id: "cust_42" },
  predicate:    "tier",
  object:       "platinum",
  validFrom:    "2026-05-01T00:00:00Z",
  confidence:   0.9,
  sourceVertical: "rent",
})
```

Returns `{ wouldOutcome, reasoning, opposingFacts, predicatePolicy }`:

| `wouldOutcome` | Meaning | What to do |
| --- | --- | --- |
| `INSERTED` | No overlapping prior; safe to write. | Just call `record_fact`. |
| `SUPERSEDED` | Would close a prior fact; resolver picks the new one as winner. | OK if the user knows the prior is outdated; surface a confirmation if it's user-visible. |
| `COMPETING` | Would land alongside a prior in COMPETING status — the resolver couldn't pick. | Either ask the user to disambiguate, or proceed and surface to a reviewer queue via `get_competing_facts`. |
| `REJECTED` | Score below reject threshold (too unconfident, too low-trust). | Either raise confidence (only if honest), drop the fact, or ask for a stronger source. |

The dry-run is JS-side approximation of `fn::resolve_fact` — small fidelity gap on `source_trust` (uses the seed table, not the per-tenant learned rate) but matches the resolver's logic on every other axis.

## link_entities — declaring a typed edge

```ts
link_entities({
  from: { vertical: "rent", id: "cust_42" },
  to:   { vertical: "shop", id: "buyer_18" },
  kind: "identity_of",                // 'identity_of' merges; other kinds add typed edges
  weight: 1.0,                        // 0..1, optional
  sourceVertical: "rent",
})
```

### `kind: identity_of` — cross-vertical merge

`identity_of` is special — it triggers a cascade that merges `from` into `to`:

- Every fact on `from` is reparented to `to`
- `from.mergedAt` + `from.mergedInto` are set so the redirect is auditable
- The conflict resolver runs over the union (so two source-of-truth facts on the same predicate compete properly)

Cycle guards:

- A self-merge (`from == to`) is rejected.
- A merge that would create a cycle (`A → B → A`) is rejected.
- A merge against an already-merged entity (`B.mergedInto = C`) follows the redirect — you end up merging into `C`, not `B`. The semantic is "merge the whole identity cluster", not "merge into the row by id".

### Non-merge kinds

Typed edges (`paid_for`, `mentioned_in`, `worked_with`, `manages`, etc.) just add a row in `knowledge_edge`. They're surfaced by `find_related_entities` and contribute to PPR / SubgraphRAG context. Free-vocabulary; tenants extend the edge taxonomy without a migration.

## retract_fact — walking a belief back

```ts
retract_fact({
  factId: "knowledge_fact:01HXYZ...",
  reason: "Source misattributed; was Bob, not Alice.",
})
```

What happens:

- The fact's `status` flips to `retracted`, `retractedAt` is set, `retractionReason` recorded.
- The cascade walks `derivedFrom` — any fact derived from this one is also retracted (depth-first).
- If this fact had previously superseded another, the predecessor is REVIVED (`status='active'`, `validUntil` restored to its pre-supersede value). The audit trail keeps the supersede/revive chain.
- Cross-vertical changefeed picks up the change so dependent systems are notified.

The row stays for audit. To actually delete (GDPR), use `forget_entity` — admin scope only.

### Predicate-class admin escalation

Three predicate classes require `brain:admin` for retract, not just `brain:write`:

- `billing_event` — affects downstream invoicing audits
- `human_declared` — represents operator-attested ground truth
- Any fact whose `source.kind === 'legal'` — regulator-visible

If the API key has only `brain:write`, the retract on these falls through with a 403. Don't pre-validate this in the agent loop; let brain enforce it and tell the user the scope they need.

## retract vs forget — when to use which

| Question | retract | forget |
| --- | --- | --- |
| "Was this ever true?" | Yes — row stays | No — row gone, only HMAC tombstone left |
| "Affects audit trail?" | Walks supersede + cascade chains | Hard delete of the entity and all its facts |
| "GDPR Art. 17 right-to-erasure?" | No — facts remain | Yes — this is the intent |
| "Reversible?" | Yes — re-record the fact | No — fact-level rehydration impossible |
| "Required scope?" | `brain:write` (admin for some predicates) | `brain:admin` |

Default to retract. Reach for forget only when a DSAR or tenant-offboarding event genuinely requires erasure.

## Pitfalls

- **Confidence inflation.** Don't pad LLM-extracted facts to 0.95 because "the model sounded sure". The resolver weighs confidence honestly; inflated values poison the conflict math for the next legitimate update.
- **`validFrom` defaults to "now" feel wrong.** Brain has no default — you must pass `validFrom`. If the user said "Alice is platinum", validFrom is the moment of conversation. If they said "Alice has been platinum since April", validFrom is April. Be precise.
- **`sourceVertical` not where the user is.** `sourceVertical` describes WHO is asserting the fact — usually the vertical the agent is operating on behalf of (`"rent"`, `"shop"`), not the vertical the agent runtime lives in (`"chat"`). Get this wrong and the conflict resolver's source_trust math goes sideways.
- **identity_of as a generic "they're related" edge.** Don't. `identity_of` is a merge directive. For "are connected", use a typed edge like `worked_with` or `interacted_with`.
- **Recording the same fact twice in a row.** The resolver dedups by (entityId, predicate, object) when bitemporal windows match — second call returns INSERTED with the original factId, not a new row. Harmless but wasteful; cache the factId from the first call.

## Companion tools

- `detect_contradiction` — preflight before record_fact
- `get_competing_facts` — see what's already unresolved on this entity (see `brain-conflict`)
- `search_knowledge` / `get_entity_profile` — find the existing fact before retracting (see `brain-search`, `brain-recall`)
- `memory_diff` — confirm the change landed (see `brain-bitemporal`)
