'use client'

import { ReactNode, useState } from 'react'
import { TraceWaterfall, DebugTracePayload } from './TraceWaterfall'

interface Props {
  pretty: ReactNode
  raw: unknown
  trace?: DebugTracePayload | null
}

type Tab = 'pretty' | 'raw' | 'trace'

export function ResponseInspector({ pretty, raw, trace }: Props) {
  const [tab, setTab] = useState<Tab>('pretty')
  return (
    <div className="border border-[var(--border)] rounded-md">
      <div className="flex border-b border-[var(--border)] text-xs">
        {(['pretty', 'raw', 'trace'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 ${
              tab === t
                ? 'text-[var(--text)] border-b-2 border-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {t}
            {t === 'trace' && trace && (
              <span className="ml-1 text-[var(--text-faint)]">
                ({trace.spans.length})
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="p-3 max-h-[60vh] overflow-auto">
        {tab === 'pretty' && pretty}
        {tab === 'raw' && (
          <pre className="text-[10px] font-mono whitespace-pre-wrap">
            {JSON.stringify(raw, null, 2)}
          </pre>
        )}
        {tab === 'trace' && <TraceWaterfall trace={trace ?? null} />}
      </div>
    </div>
  )
}
