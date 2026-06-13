'use client'

import { FormEvent, useState } from 'react'
import {
  ArrowRight,
  Loader2,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { DemoFrame } from './DemoFrame'
import { DemoTraceStrip, TracePayload as BaseTracePayload } from './DemoTraceStrip'

interface TraceArtifact {
  spanId?: string
  name: string
  ts: number
  value: unknown
}
interface TracePayload extends BaseTracePayload {
  artifacts?: TraceArtifact[]
}

interface IngestResult {
  skipped?: boolean
  reason?: string
  extractedEntityIds?: string[]
  extractedFactIds?: string[]
  trace?: TracePayload
}

interface SearchHit {
  entityId: string
  canonicalName: string
  entityType: string
  score: number
  externalRefs?: Record<string, string>
  facts: Array<{
    factId: string
    predicate: string
    object: string
    confidence: number
    status: string
    validFrom: string
    validUntil?: string
  }>
}

interface SearchResp {
  results: SearchHit[]
  trace?: TracePayload
}

interface ChatTurn {
  id: string
  kind: 'ingest' | 'search'
  prompt: string
  pending: boolean
  error?: string
  ingest?: IngestResult
  search?: SearchResp
  includePii?: boolean
}

const STARTER_MESSAGE =
  'Maria Petrov is our new CTO at Acme. She moved here from Berlin and prefers vegan lunch.'
const STARTER_QUERY = 'who runs engineering at Acme'

export function LiveIngestSlide() {
  const [text, setText] = useState(STARTER_MESSAGE)
  const [query, setQuery] = useState(STARTER_QUERY)
  const [includePii, setIncludePii] = useState(false)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)

  const submitMention = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!text.trim() || busy) return
    const id = crypto.randomUUID()
    const prompt = text
    setTurns((t) => [
      ...t,
      { id, kind: 'ingest', prompt, pending: true },
    ])
    setBusy(true)
    try {
      const res = await fetch('/api/admin/proxy/v1/admin/demo/ingest-mention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prompt }),
      })
      const data = await res.json()
      setTurns((t) =>
        t.map((x) =>
          x.id === id
            ? {
                ...x,
                pending: false,
                ingest: res.ok ? data : undefined,
                error: res.ok ? undefined : data?.error ?? `${res.status}`,
              }
            : x,
        ),
      )
    } catch (err) {
      setTurns((t) =>
        t.map((x) =>
          x.id === id
            ? { ...x, pending: false, error: (err as Error).message }
            : x,
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const submitSearch = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!query.trim() || busy) return
    const id = crypto.randomUUID()
    const q = query
    setTurns((t) => [
      ...t,
      { id, kind: 'search', prompt: q, pending: true, includePii },
    ])
    setBusy(true)
    try {
      const res = await fetch('/api/admin/proxy/v1/admin/demo/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, includePii, limit: 5 }),
      })
      const data = await res.json()
      setTurns((t) =>
        t.map((x) =>
          x.id === id
            ? {
                ...x,
                pending: false,
                search: res.ok ? data : undefined,
                error: res.ok ? undefined : data?.error ?? `${res.status}`,
              }
            : x,
        ),
      )
    } catch (err) {
      setTurns((t) =>
        t.map((x) =>
          x.id === id
            ? { ...x, pending: false, error: (err as Error).message }
            : x,
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (busy) return
    setBusy(true)
    try {
      await fetch('/api/admin/proxy/v1/admin/demo/reset', { method: 'POST' })
      setTurns([])
    } finally {
      setBusy(false)
    }
  }

  return (
    <DemoFrame
      slideNumber="01a"
      eyebrow="ingest"
      title="Скажите brain. Спросите brain. Увидите разницу."
      subtitle="Слева — сырой разговор. Справа — что brain извлёк: атомарные факты с предикатом, объектом и confidence. Дальше — поиск против накопленного состояния."
    >
      <div className="flex items-center gap-3 mb-6">
        <span className="text-xs font-mono text-[var(--text-faint)]">
          tenant: demo_live
        </span>
        <button
          type="button"
          onClick={reset}
          disabled={busy || turns.length === 0}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" />
          reset tenant
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6">
        {/* Compose column */}
        <div className="space-y-4">
          <form
            onSubmit={submitMention}
            className="border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-elevated)]"
          >
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)] mb-2">
              tell brain
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="w-full bg-transparent text-base text-[var(--text)] outline-none resize-none placeholder:text-[var(--text-faint)]"
              placeholder="e.g. Maria just got promoted to VP. She moved to Berlin."
            />
            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={busy || !text.trim()}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-[var(--accent)] text-white text-sm disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                ingest
              </button>
            </div>
          </form>

          <form
            onSubmit={submitSearch}
            className="border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-elevated)]"
          >
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)] mb-2">
              ask brain
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-base text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
              placeholder="who runs engineering at Acme"
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              <label className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 select-none">
                <input
                  type="checkbox"
                  checked={includePii}
                  onChange={(e) => setIncludePii(e.target.checked)}
                />
                include brain:read_pii
              </label>
              <button
                type="submit"
                disabled={busy || !query.trim()}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-[var(--accent)] text-white text-sm disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                search
              </button>
            </div>
          </form>

          <div className="text-xs text-[var(--text-faint)] leading-relaxed">
            примеры на сцене:
            <ul className="mt-1 space-y-0.5">
              <li>1. ingest «Maria Petrov is our new CTO at Acme. Berlin. Vegan.»</li>
              <li>2. ask «who runs engineering at Acme» → Maria</li>
              <li>3. ingest «Maria switched to keto last month.»</li>
              <li>4. ask «Maria diet preference» → keto (vegan superseded)</li>
            </ul>
          </div>
        </div>

        {/* Timeline column */}
        <div className="space-y-3">
          {turns.length === 0 && (
            <div className="border border-dashed border-[var(--border)] rounded-lg p-8 text-center text-sm text-[var(--text-muted)]">
              напечатайте слева и нажмите ingest или search.
            </div>
          )}
          {turns
            .slice()
            .reverse()
            .map((t) => (
              <TurnCard key={t.id} turn={t} />
            ))}
        </div>
      </div>

      <div className="mt-6 text-xs text-[var(--text-faint)] font-mono">
        endpoint: POST /v1/admin/demo/{`{ingest-mention | search | reset}`}
      </div>
    </DemoFrame>
  )
}

function TurnCard({ turn }: { turn: ChatTurn }) {
  return (
    <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-elevated)]">
      <div className="flex items-baseline gap-2 mb-2">
        <span
          className={`text-[10px] uppercase tracking-[0.2em] ${
            turn.kind === 'ingest'
              ? 'text-[var(--accent)]'
              : 'text-[var(--warning)]'
          }`}
        >
          {turn.kind === 'ingest' ? 'tell' : 'ask'}
        </span>
        {turn.kind === 'search' && turn.includePii && (
          <span className="text-[10px] font-mono text-[var(--text-faint)]">
            +read_pii
          </span>
        )}
        {turn.pending && (
          <Loader2 className="w-3 h-3 animate-spin text-[var(--text-muted)] ml-auto" />
        )}
      </div>
      <div className="text-sm text-[var(--text-muted)] font-mono mb-3">
        “{turn.prompt}”
      </div>

      {turn.error && (
        <div className="text-xs text-[var(--danger)] font-mono">
          {turn.error}
        </div>
      )}

      {turn.kind === 'ingest' && turn.ingest && <IngestBody data={turn.ingest} />}
      {turn.kind === 'search' && turn.search && <SearchBody data={turn.search} />}
    </div>
  )
}

function IngestBody({ data }: { data: IngestResult }) {
  // Pull NLU extracted entities + facts from the artifact buffer if the
  // backend included it via traceArtifact('ingest.nlu.extracted', ...).
  const nluArt = data.trace?.artifacts?.find(
    (a) => a.name === 'ingest.nlu.extracted',
  )
  const extracted =
    nluArt && typeof nluArt.value === 'object'
      ? (nluArt.value as {
          entities: Array<{ name: string; type: string; canonical?: string }>
          facts: Array<{
            entityIndex: number
            predicate: string
            object: string
            confidence: number
          }>
        })
      : null

  if (data.skipped) {
    return (
      <div className="text-sm text-[var(--warning)] italic">
        skipped: {data.reason}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-[var(--text-muted)]">
        <ArrowRight className="w-3 h-3 inline mr-1" />
        {data.extractedEntityIds?.length ?? 0} entities ·{' '}
        {data.extractedFactIds?.length ?? 0} facts
      </div>

      {extracted && extracted.facts.length > 0 && (
        <ul className="space-y-1">
          {extracted.facts.map((f, i) => {
            const ent = extracted.entities[f.entityIndex]
            return (
              <li
                key={i}
                className="flex items-baseline gap-2 text-sm font-mono"
              >
                <span className="text-[var(--text-muted)] truncate max-w-[10rem]">
                  {ent?.canonical ?? ent?.name ?? '?'}
                </span>
                <span className="text-[var(--text-faint)] text-[10px] uppercase tracking-wider">
                  {f.predicate}
                </span>
                <span className="text-[var(--text)] truncate flex-1">
                  {f.object}
                </span>
                <span className="text-[10px] text-[var(--text-faint)]">
                  {f.confidence.toFixed(2)}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <DemoTraceStrip trace={data.trace} />
    </div>
  )
}

function SearchBody({ data }: { data: SearchResp }) {
  if (data.results.length === 0) {
    return (
      <div className="text-sm text-[var(--text-muted)] italic">
        ∅ brain returned no hits
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {data.results.map((r, i) => (
          <li key={r.entityId}>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-mono text-[var(--text-faint)] w-5">
                #{i + 1}
              </span>
              <span className="font-medium text-[var(--text)]">
                {r.canonicalName}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
                {r.entityType}
              </span>
              <span className="ml-auto font-mono text-[10px] text-[var(--accent)]">
                {r.score.toFixed(3)}
              </span>
            </div>
            <ul className="mt-1 ml-7 space-y-0.5">
              {r.facts.slice(0, 5).map((f) => (
                <li
                  key={f.factId}
                  className="flex items-baseline gap-2 text-xs font-mono"
                >
                  <span className="text-[var(--text-faint)] uppercase tracking-wider text-[10px] w-16">
                    {f.predicate}
                  </span>
                  <span className="text-[var(--text)] flex-1 truncate">
                    {f.object}
                  </span>
                  {f.status !== 'active' && (
                    <span
                      className={`text-[10px] uppercase tracking-wider ${
                        f.status === 'retracted'
                          ? 'text-[var(--danger)]'
                          : 'text-[var(--text-faint)]'
                      }`}
                    >
                      {f.status}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <DemoTraceStrip trace={data.trace} />
    </div>
  )
}
