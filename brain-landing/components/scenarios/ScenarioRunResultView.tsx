'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ShieldAlert,
  XCircle,
} from 'lucide-react'

export interface QueryRunResult {
  query: string
  expectedTopEntityRef: string
  rankOfExpected: number
  topEntityRef: string | null
  factPredicateMatched: boolean | null
  asOf?: string
  durationMs: number
  hitCount: number
  topHits: Array<{
    entityId: string
    canonicalName: string
    score: number
    externalRefs: Record<string, string>
  }>
  passed: boolean
  piiGatedCorrectly: boolean | null
  mustNotLeakPredicate?: string
  error?: string
}

export interface MemoryAssertionResult {
  description: string
  kind: 'no_search_match' | 'search_object_present' | 'search_object_absent'
  passed: boolean
  detail?: string
  durationMs: number
}

export interface IdentityMergeOutcomeShape {
  survivorRef: string
  loserRef: string
  merged: boolean
  falseMerges: string[]
  unresolvedDistractors: string[]
  detail?: string
}

export interface ScenarioRunOutcome {
  scenarioId: string
  vertical: string
  companyId: string
  startedAt: string
  durationMs: number
  passed: boolean
  setupSummary: {
    facts: number
    mentions: number
    links: number
    retracts: number
    forgets: number
    errors: Array<{ step: number; kind: string; error: string }>
  }
  queryResults: QueryRunResult[]
  memoryAssertionResults: MemoryAssertionResult[]
  identityMergeResult?: IdentityMergeOutcomeShape
  synthesizeSkipped?: { count: number; reason: string }
  metrics: {
    recallAt1: number
    recallAt5: number
    queries: number
    passes: number
    memoryAssertionsPassed: number
    memoryAssertionsTotal: number
    piiGatingPassed: number
    piiGatingTotal: number
  }
}

export function ScenarioRunResultView({
  outcome,
}: {
  outcome: ScenarioRunOutcome
}) {
  return (
    <div className="space-y-3">
      <div className="border border-[var(--border)] rounded-md p-3">
        <div className="flex items-center gap-2">
          {outcome.passed ? (
            <CheckCircle2 className="w-4 h-4 text-[var(--accent)]" />
          ) : (
            <XCircle className="w-4 h-4 text-[var(--danger)]" />
          )}
          <span className="font-medium text-[var(--text)]">
            {outcome.passed ? 'passed' : 'failed'}
          </span>
          <span className="text-xs text-[var(--text-faint)]">
            {outcome.durationMs}ms · {outcome.companyId}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Metric label="recall@1" value={outcome.metrics.recallAt1} />
          <Metric label="recall@5" value={outcome.metrics.recallAt5} />
          <Metric
            label="queries"
            value={`${outcome.metrics.passes}/${outcome.metrics.queries}`}
          />
          {outcome.metrics.memoryAssertionsTotal > 0 && (
            <Metric
              label="mem-assert"
              value={`${outcome.metrics.memoryAssertionsPassed}/${outcome.metrics.memoryAssertionsTotal}`}
            />
          )}
          {outcome.metrics.piiGatingTotal > 0 && (
            <Metric
              label="pii-gating"
              value={`${outcome.metrics.piiGatingPassed}/${outcome.metrics.piiGatingTotal}`}
            />
          )}
        </div>
        <div className="mt-2 text-xs text-[var(--text-faint)]">
          setup: {outcome.setupSummary.facts} facts ·{' '}
          {outcome.setupSummary.mentions} mentions ·{' '}
          {outcome.setupSummary.links} links ·{' '}
          {outcome.setupSummary.retracts} retracts ·{' '}
          {outcome.setupSummary.forgets} forgets
          {outcome.setupSummary.errors.length > 0 && (
            <span className="text-[var(--danger)] ml-2">
              {outcome.setupSummary.errors.length} errors
            </span>
          )}
        </div>
        {outcome.setupSummary.errors.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[10px] font-mono text-[var(--danger)]">
            {outcome.setupSummary.errors.map((e, i) => (
              <li key={i}>
                step {e.step} ({e.kind}): {e.error}
              </li>
            ))}
          </ul>
        )}
      </div>

      {outcome.identityMergeResult && (
        <IdentityMergeSection im={outcome.identityMergeResult} />
      )}

      {outcome.memoryAssertionResults.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-[var(--text-faint)] mb-1">
            Memory assertions
          </h3>
          <ul className="space-y-1">
            {outcome.memoryAssertionResults.map((a, i) => (
              <MemoryAssertionRow key={i} a={a} />
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-xs uppercase tracking-wider text-[var(--text-faint)] mb-1">
          Queries
        </h3>
        <ul className="space-y-1">
          {outcome.queryResults.map((q, i) => (
            <QueryRow key={i} q={q} />
          ))}
        </ul>
      </div>

      {outcome.synthesizeSkipped && (
        <div className="border border-[var(--warning)]/40 bg-[var(--warning)]/5 rounded-md p-2 flex gap-2 items-start text-xs">
          <AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" />
          <div>
            <div className="text-[var(--text)]">
              synthesize: skipped ({outcome.synthesizeSkipped.count}{' '}
              {outcome.synthesizeSkipped.count === 1 ? 'query' : 'queries'})
            </div>
            <div className="text-[var(--text-muted)] mt-0.5">
              {outcome.synthesizeSkipped.reason}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function IdentityMergeSection({ im }: { im: IdentityMergeOutcomeShape }) {
  const ok =
    im.merged &&
    im.falseMerges.length === 0 &&
    im.unresolvedDistractors.length === 0
  return (
    <div
      className={`border rounded-md p-2 ${
        ok
          ? 'border-[var(--border)]'
          : 'border-[var(--danger)]/40 bg-[var(--danger)]/5'
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        {ok ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-[var(--danger)]" />
        )}
        <span className="text-[var(--text)]">identity merge</span>
        <span className="font-mono text-[var(--text-muted)]">
          {im.survivorRef} ⇐ {im.loserRef}
        </span>
        <span className="ml-auto text-[10px] text-[var(--text-faint)]">
          merged={String(im.merged)}
        </span>
      </div>
      {im.detail && (
        <div className="text-[10px] text-[var(--text-muted)] mt-1">
          {im.detail}
        </div>
      )}
      {im.falseMerges.length > 0 && (
        <div className="text-[10px] text-[var(--danger)] mt-1 font-mono">
          false-merges: {im.falseMerges.join(', ')}
        </div>
      )}
      {im.unresolvedDistractors.length > 0 && (
        <div className="text-[10px] text-[var(--warning)] mt-1 font-mono">
          unresolved distractors: {im.unresolvedDistractors.join(', ')}
        </div>
      )}
    </div>
  )
}

function MemoryAssertionRow({ a }: { a: MemoryAssertionResult }) {
  return (
    <li
      className={`border rounded-md p-2 flex items-start gap-2 text-xs ${
        a.passed
          ? 'border-[var(--border)]'
          : 'border-[var(--danger)]/40 bg-[var(--danger)]/5'
      }`}
    >
      {a.passed ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] mt-0.5 shrink-0" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-[var(--danger)] mt-0.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[var(--text)]">{a.description}</div>
        <div className="text-[10px] text-[var(--text-faint)] mt-0.5 font-mono">
          {a.kind} · {a.durationMs}ms
        </div>
        {a.detail && !a.passed && (
          <div className="text-[10px] text-[var(--text-muted)] mt-1">
            {a.detail}
          </div>
        )}
      </div>
    </li>
  )
}

function Metric({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div>
      <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">
        {label}
      </div>
      <div className="font-mono text-[var(--text)]">
        {typeof value === 'number' ? value.toFixed(2) : value}
      </div>
    </div>
  )
}

function QueryRow({ q }: { q: QueryRunResult }) {
  const [open, setOpen] = useState(false)
  return (
    <li
      className={`border rounded-md p-2 ${
        q.passed
          ? 'border-[var(--border)]'
          : 'border-[var(--danger)]/40 bg-[var(--danger)]/5'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-left"
      >
        <ChevronRight
          className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        {q.passed ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-[var(--danger)]" />
        )}
        <span className="text-sm text-[var(--text)] truncate">{q.query}</span>
        {q.mustNotLeakPredicate && (
          <ShieldAlert
            className={`w-3.5 h-3.5 shrink-0 ${
              q.piiGatedCorrectly
                ? 'text-[var(--accent)]'
                : 'text-[var(--danger)]'
            }`}
          />
        )}
        <span className="ml-auto text-xs text-[var(--text-faint)]">
          rank {q.rankOfExpected === 0 ? '∞' : q.rankOfExpected} · {q.durationMs}ms
        </span>
      </button>
      {open && (
        <div className="mt-2 ml-5 text-xs space-y-1">
          <div className="text-[var(--text-muted)]">
            expected{' '}
            <span className="font-mono text-[var(--text)]">
              {q.expectedTopEntityRef}
            </span>{' '}
            · got{' '}
            <span className="font-mono text-[var(--text)]">
              {q.topEntityRef ?? '—'}
            </span>
          </div>
          {q.asOf && (
            <div className="text-[var(--text-faint)]">asOf {q.asOf}</div>
          )}
          {q.error && (
            <div className="text-[var(--danger)] font-mono">
              error: {q.error}
            </div>
          )}
          {q.factPredicateMatched !== null && (
            <div className="text-[var(--text-muted)]">
              factPredicateMatched:{' '}
              <span
                className={
                  q.factPredicateMatched
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--danger)]'
                }
              >
                {String(q.factPredicateMatched)}
              </span>
            </div>
          )}
          {q.mustNotLeakPredicate && (
            <div className="text-[var(--text-muted)]">
              piiGated (must not leak{' '}
              <span className="font-mono">{q.mustNotLeakPredicate}</span>):{' '}
              <span
                className={
                  q.piiGatedCorrectly
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--danger)]'
                }
              >
                {String(q.piiGatedCorrectly)}
              </span>
            </div>
          )}
          <div className="mt-1">
            <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">
              top hits
            </div>
            <ul className="space-y-0.5">
              {q.topHits.map((h, i) => (
                <li
                  key={h.entityId}
                  className="text-xs flex items-baseline gap-2"
                >
                  <span className="font-mono w-5 text-[var(--text-faint)]">
                    #{i + 1}
                  </span>
                  <span className="text-[var(--text)] truncate flex-1">
                    {h.canonicalName}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--accent)]">
                    {h.score.toFixed(3)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  )
}
