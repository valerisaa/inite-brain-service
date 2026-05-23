---
name: brain-recall
description: Recall everything brain knows about one specific entity — current profile, full bitemporal timeline, and graph neighbours. Use when the user names a person/company/thing and asks "tell me about them" or "what's their history".
---

# brain-recall

When the user points at one entity and asks for the full picture, combine three MCP tools in order: `get_entity_profile` (now-snapshot) → `get_entity_timeline` (history) → `find_related_entities` (graph context). Each addresses a different question and the user usually wants pieces of all three.

## When to use

- "Tell me about Alice Smith."
- "What's the full history on Acme Corp?"
- "Who is Bob connected to?"
- "What changed for tenant 42 over the last quarter?"

Do **not** use for:
- Open-ended search where the entity isn't yet identified → use `brain-search` first
- Recording new facts → `record_fact`

## How to invoke

Identifying the entity:

- If the user gave a brain entity id (`knowledge_entity:01HXYZ...`), pass it directly.
- If the user named a person/company, call `search_knowledge({ query: "<name>", limit: 3 })` first, pick the top hit's `entity.id`, and confirm with the user if there's ambiguity ("I found two Acmes — Inc and LLC. Which?").
- If the user gave a vertical+id (`rent.cust_42`), call `get_entity_profile({ entityId: "rent.cust_42" })` — brain resolves the external ref.

### Step 1 — profile (now snapshot)

```ts
get_entity_profile({
  entityId: "knowledge_entity:01HXYZ...",
  asOf: undefined,  // omit for "now"
})
```

Returns canonical name, type, all externalRefs (cross-vertical ids), and **active** facts only. This is what brain currently believes is true.

### Step 2 — timeline (full bitemporal sweep)

```ts
get_entity_timeline({
  entityId: "knowledge_entity:01HXYZ...",
  since: "2026-01-01T00:00:00Z",  // optional lower bound
  until: undefined,                // open-ended
})
```

Returns every fact ever recorded, **including retracted and superseded ones**. Each carries `validFrom`, `validUntil`, `recordedAt`, `retractedAt`, and a `status` field (`active` / `superseded` / `retracted`).

Use this when the user asks:
- "What did we know on X?" — filter the returned rows by `recordedAt <= X AND (retractedAt IS NULL OR retractedAt > X)`
- "Did anything get walked back?" — filter to `status = 'retracted'`
- "When did the tier change?" — group `tier` rows by `validFrom`

### Step 3 — connections (graph context)

```ts
find_related_entities({
  entityId: "knowledge_entity:01HXYZ...",
  kind: undefined,  // optional edge filter, e.g. "paid_for", "mentioned_in", "identity_of"
})
```

Returns typed edges and the entities on the other side. Useful for "who else is involved" / "what did they touch" / "merged-with" questions. Edge `kind` filter is open-vocabulary — common kinds include `identity_of` (cross-vertical merge), `paid_for`, `mentioned_in`, `manages`, `member_of`.

## Composing a recall

Decide how much to fetch based on the user's question:

| Question shape | Profile | Timeline | Connections |
| --- | --- | --- | --- |
| "Tell me about X" (short) | ✓ | — | — |
| "Full picture on X" | ✓ | ✓ | ✓ |
| "What changed about X?" | — | ✓ | — |
| "Who's X connected to?" | ✓ | — | ✓ |
| "What did we know on April 1?" | ✓ (with `asOf`) | — | — |

Don't always pull all three. Each call is a round-trip; spending one when the user asked for the other is rude.

## Reading retracted rows

A retracted fact is **not deleted**. It stays in the timeline with `status: 'retracted'`, `retractedAt: <ts>`, and a reason. Two valid surfaces:

- **Default UX** — hide retracted from the user unless they ask "anything walked back?"
- **Audit UX** — show them inline with a strikethrough or `(retracted: <reason>)` annotation

Never lie that the fact never existed. Brain holds the audit trail precisely so you can show "we used to believe X, then learned otherwise on Y".

## Pitfalls

- **`get_entity_profile` with stale `asOf`** — if you pass `asOf` from a previous turn, you'll get the snapshot from then, not now. Either drop the arg or freshen it to current time.
- **Timeline can be large**. For long-lived entities (years of history) use `since` to window it. The MCP transport will happily ship 10MB JSON; the agent context window won't.
- **Graph walks aren't transitive in one call**. `find_related_entities` returns 1-hop neighbours. For 2+ hops, walk recursively — but stop at 3 hops or the answer drowns in noise.

## Companion tools

- `search_knowledge` — when entity isn't yet identified
- `record_fact` / `retract_fact` — write surface (requires `brain:write`)
