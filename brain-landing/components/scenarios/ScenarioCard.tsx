'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { normalizeLang } from '../../lib/i18n'

export interface ScenarioSummary {
  id: string
  vertical: string
  description: string
  setupSteps: number
  queries: number
  hasMemoryAssertions: boolean
  hasIdentityMerge: boolean
  hasSynthesize: boolean
}

export function ScenarioCard({ s }: { s: ScenarioSummary }) {
  const params = useParams<{ lang: string }>()
  const lang = normalizeLang(params?.lang)
  return (
    <Link
      href={`/${lang}/admin/scenarios/${encodeURIComponent(s.id)}`}
      className="block border border-[var(--border)] rounded-md p-3 hover:bg-[var(--bg-overlay)] transition-colors"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--bg-overlay)] text-[var(--text-muted)]">
          {s.vertical}
        </span>
        <span className="font-mono text-xs text-[var(--text)] truncate">
          {s.id}
        </span>
      </div>
      <div className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2">
        {s.description}
      </div>
      <div className="mt-2 flex gap-3 text-[10px] text-[var(--text-faint)]">
        <span>{s.setupSteps} setup</span>
        <span>{s.queries} queries</span>
        {s.hasMemoryAssertions && <span>· mem-assert</span>}
        {s.hasIdentityMerge && <span>· identity</span>}
        {s.hasSynthesize && <span>· synth</span>}
      </div>
    </Link>
  )
}
