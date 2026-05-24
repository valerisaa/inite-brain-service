'use client'

import { useState } from 'react'
import { MentionForm } from '../../../../components/playground/MentionForm'
import { SearchForm } from '../../../../components/playground/SearchForm'
import { SynthesizeForm } from '../../../../components/playground/SynthesizeForm'

type Tab = 'mention' | 'search' | 'synthesize'

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'mention', label: 'Ingest mention', hint: 'NLU extraction trace' },
  { id: 'search', label: 'Search', hint: 'retrieval pipeline trace' },
  { id: 'synthesize', label: 'Synthesize', hint: 'generator + verifier' },
]

export default function PlaygroundPage() {
  const [tab, setTab] = useState<Tab>('mention')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-[var(--text)]">
          Playground
        </h1>
        <p className="text-xs text-[var(--text-muted)]">
          Hit brain endpoints with one form and inspect the per-stage trace.
          Each call carries <code>X-Brain-Debug: 1</code> so the backend emits
          a span/artifact buffer alongside the response.
        </p>
      </div>

      <div className="flex gap-1 border-b border-[var(--border)] text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 -mb-px border-b-2 ${
              tab === t.id
                ? 'border-[var(--accent)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {t.label}
            <span className="ml-2 text-[10px] text-[var(--text-faint)]">
              {t.hint}
            </span>
          </button>
        ))}
      </div>

      {tab === 'mention' && <MentionForm />}
      {tab === 'search' && <SearchForm />}
      {tab === 'synthesize' && <SynthesizeForm />}
    </div>
  )
}
