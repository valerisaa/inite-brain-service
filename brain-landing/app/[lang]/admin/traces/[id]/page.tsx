'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  TraceWaterfall,
  DebugTracePayload,
} from '../../../../../components/playground/TraceWaterfall'
import { normalizeLang } from '../../../../../lib/i18n'

interface FullTrace extends DebugTracePayload {
  ts: string
  method: string
  path: string
  status: number
  durationMs: number
  companyId?: string
}

export default function TraceDetailPage() {
  const params = useParams<{ id: string; lang: string }>()
  const id = params?.id
  const lang = normalizeLang(params?.lang)
  const [trace, setTrace] = useState<FullTrace | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/api/admin/proxy/v1/admin/traces/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) throw new Error(d.error)
        setTrace(d)
      })
      .catch((e) => setError((e as Error).message))
  }, [id])

  if (error) {
    return (
      <div className="text-xs text-[var(--danger)] font-mono">{error}</div>
    )
  }
  if (!trace) {
    return (
      <div className="text-xs text-[var(--text-muted)]">Loading trace…</div>
    )
  }

  return (
    <div className="space-y-3">
      <Link
        href={`/${lang}/admin/traces`}
        className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        ← traces
      </Link>
      <div>
        <h1 className="text-base font-mono text-[var(--text)]">
          {trace.method} {trace.path}
        </h1>
        <div className="text-xs text-[var(--text-faint)]">
          {trace.ts} · {trace.durationMs}ms · status {trace.status}
          {trace.companyId && ` · ${trace.companyId}`}
        </div>
      </div>
      <TraceWaterfall trace={trace} />
    </div>
  )
}
