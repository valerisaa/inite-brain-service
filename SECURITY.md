# Security Policy

## Reporting a vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Email the maintainers privately at **security@inite.ai**.

Acceptable contents:

- A clear description of the issue (what's wrong)
- Reproduction steps OR a proof-of-concept (curl / scenario JSON / sketch)
- The version / commit SHA affected (if you can pin it)
- Your assessment of severity (we'll re-assess on our end, but your prior
  is useful)

What happens next:

1. **Acknowledgement within 72h.** If you haven't heard from us by then,
   ping `mike@inite.ai` directly with a subject line `[security followup]`.
2. **Triage within 7 days.** We'll either confirm the issue, classify it,
   and give you an estimated fix timeline — or push back with our
   reasoning if we think it isn't a vulnerability.
3. **Fix + disclosure.** Critical issues (auth bypass, PII leak across
   tenants, RCE) get a patched container shipped within 48h of triage,
   typically with a coordinated public advisory once the prod fleet is
   updated. Non-critical issues follow the normal release cadence.
4. **Credit.** We attribute the report to you in the advisory unless you
   prefer anonymity. Tell us either way.

## In scope

The following are explicitly in scope:

- **Tenant isolation breaks.** Any path where caller for tenant A can read
  or write data scoped to tenant B is a P0. The architecture says this
  shouldn't be possible (per-tenant SurrealDB databases, no shared
  tables), but report any flaw in that fence — DB-level PII PERMISSIONS,
  scoped pool sign-in, ApiKey routing, JWT scope handling, MCP per-tenant
  isolation.
- **Authentication bypass.** Static-key spoofing, JWT verification flaws,
  JWKS rotation handling, the `brain_caller` scoped-pool credential
  story.
- **PII gating bypass.** A caller without `brain:read_pii` getting any
  PII field value (vs the documented behaviour of seeing the field exists
  but with `object` returning NONE).
- **GDPR forget incomplete.** Anything left behind after
  `POST /v1/entities/:id/forget` that could be used to reconstruct the
  forgotten entity (beyond the documented HMAC tombstone in
  `forgotten_entity`).
- **Audit-trail tampering.** Modifications to `audit_event`,
  `operator_action`, `forgotten_entity`, or `schema_migrations` that a
  non-admin caller can drive.
- **Prompt injection in extraction or generation paths** that leads to
  PII leak, cross-tenant data exposure, or fact-graph corruption (vs the
  documented mild output-shape failures the extractor handles
  gracefully).
- **Resource exhaustion** that takes down a single brain instance and
  isn't recoverable without operator intervention.
- **Supply-chain.** A dependency in `pnpm-lock.yaml` with a known CVE
  that brain's usage actually exercises.

## Out of scope

- Issues in self-hosted forks that don't reproduce against `main` at
  HEAD. Fork-specific issues are out of scope for the upstream advisory
  channel; report them to the fork's maintainers.
- Rate-limit bypass against brain.inite.ai unless it leads to data
  exposure. The service has app-layer throttling; bypassing it to read
  your own tenant's data faster is not a vuln.
- Username enumeration via the auth-service (that's the auth-service's
  surface, not brain's).
- DoS via OpenAI quota exhaustion. The OpenAI key is per-deployment;
  exhausting it is operationally costly but not a vulnerability in brain.
- Logging of input that the user provided (request bodies, query
  strings). We sanitise auth headers in logs; if you see plaintext keys
  in `/v1/admin/audit` output that's a separate report worth making.
- Old container images that we've already shipped a fix for. Make sure
  you're testing against the current `:latest`.

## Disclosure timeline (default)

Without coordination, our default disclosure timeline is **90 days from
the date you reported the issue to security@inite.ai**:

- 0-7 days: triage + reproduction
- 7-30 days: fix in main, internal regression test added
- 30-60 days: deployed to production fleet, monitored
- 60-90 days: public advisory (CVE if applicable)

If the issue is being actively exploited in the wild, we shorten that to
"as fast as we can patch and deploy". If you need a different timeline
(extended embargo, faster disclosure), tell us upfront and we'll
coordinate.

We never ship a fix and ask you to sit on disclosure indefinitely. 90
days is the firm cap.

## Bug bounty

We don't run a formal bounty program. We *do* send swag and public credit
for non-trivial findings. If a finding is significant enough to warrant
direct payment, we'll discuss case-by-case — INITE is a startup, not
HackerOne, but we don't expect researchers to work for free either.

## Cryptography

Brain's cryptographic surfaces:

- **`FORGET_HMAC_KEY`** — HMAC-SHA256 key used to derive opaque tombstone
  markers in `forgotten_entity` (so we can prove a forget happened
  without retaining the forgotten id). Must be ≥32 chars; `NODE_ENV=production`
  + missing key crash-loops the service on boot (defence-in-depth).
- **Bearer token storage** — ApiKeys are stored as `sha256:<hex>`; the
  plaintext is never written to disk or logged. JWT verification uses
  the JWKS published by `auth.inite.ai` with audience `brain`.
- **TLS** — Traefik terminates HTTPS with Let's Encrypt certs. The
  internal `brain ↔ surrealdb` link is `ws://` inside the docker network
  (not exposed externally). If you find that connection somehow exposed
  externally, that's a P0.

We do NOT roll our own crypto. If a fix would require novel cryptographic
work, we'll consult external review before shipping.

## Out-of-band contact

For pre-disclosure / embargoed work, you can also reach us via Signal
(request the number via the email channel first). PGP key available on
request; we don't list it here because we cycle it periodically.
