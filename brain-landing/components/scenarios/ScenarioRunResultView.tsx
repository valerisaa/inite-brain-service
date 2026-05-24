'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, ChevronRight } from 'lucide-react'

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
  metrics: {
    recallAt1: number
    recallAt5: number
    queries: number
    passes: number
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
            value={outcome.metrics.queries}
            isInt
          />
          <Metric label="passes" value={outcome.metrics.passes} isInt />
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
    </div>
  )
}

function Metric({
  label,
  value,
  isInt,
}: {
  label: string
  value: number
  isInt?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">
        {label}
      </div>
      <div className="font-mono text-[var(--text)]">
        {isInt ? value : value.toFixed(2)}
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
