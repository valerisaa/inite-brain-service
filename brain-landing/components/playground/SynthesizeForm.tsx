'use client'

import { useState } from 'react'
import { usePlaygroundCall } from './usePlaygroundCall'
import { ResponseInspector } from './ResponseInspector'

interface SynthesizeResult {
  answer: string | null
  reason?: string
  citations?: Array<{
    factId: string
    entityId: string
    canonicalName: string
    predicate: string
    object: string
  }>
  results?: any[]
}

export function SynthesizeForm() {
  const [query, setQuery] = useState('Who is Sarah Kim?')
  const [asOf, setAsOf] = useState('')
  const call = usePlaygroundCall<SynthesizeResult>()

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          call.send('v1/synthesize', {
            body: {
              query,
              ...(asOf ? { asOf } : {}),
            },
          })
        }}
        className="space-y-2"
      >
        <label className="block text-xs text-[var(--text-muted)]">Query</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-sm text-[var(--text)]"
        />
        <div>
          <label className="block text-xs text-[var(--text-muted)]">
            asOf (ISO, optional)
          </label>
          <input
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            placeholder="2026-01-01T00:00:00Z"
            className="w-full border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-xs font-mono text-[var(--text)]"
          />
        </div>
        <button
          type="submit"
          disabled={call.loading}
          className="px-3 py-1.5 rounded-md bg-[var(--accent)] text-white text-sm disabled:opacity-50"
        >
          {call.loading ? 'Synthesizing…' : 'POST /v1/synthesize'}
        </button>
        {call.durationMs != null && (
          <span className="ml-3 text-xs text-[var(--text-faint)]">
            {call.durationMs}ms
          </span>
        )}
      </form>

      {call.error && (
        <div className="text-xs text-[var(--danger)] font-mono whitespace-pre-wrap">
          {call.error}
        </div>
      )}

      {call.data && (
        <ResponseInspector
          raw={call.data}
          trace={call.trace}
          pretty={
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-[var(--text-faint)] uppercase tracking-wider mb-1">
                  answer
                </div>
                <div className="text-[var(--text)] whitespace-pre-wrap">
                  {call.data.answer ?? (
                    <span className="text-[var(--warning)] italic">
                      no answer · {call.data.reason}
                    </span>
                  )}
                </div>
              </div>
              {call.data.citations?.length ? (
                <div>
                  <div className="text-xs text-[var(--text-faint)] uppercase tracking-wider mb-1">
                    citations
                  </div>
                  <ul className="space-y-0.5">
                    {call.data.citations.map((c) => (
                      <li
                        key={c.factId}
                        className="text-xs flex items-baseline gap-2"
                      >
                        <span className="font-mono text-[var(--text-faint)] text-[10px]">
                          {c.factId.slice(0, 10)}
                        </span>
                        <span className="text-[var(--text-muted)]">
                          {c.canonicalName} ·
                        </span>
                        <span className="text-[var(--text)] truncate flex-1">
                          {c.predicate}: {c.object}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          }
        />
      )}
    </div>
  )
}
