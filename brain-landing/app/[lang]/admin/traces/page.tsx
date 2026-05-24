'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { normalizeLang } from '../../../../lib/i18n'

interface TraceMeta {
  requestId: string
  ts: string
  method: string
  path: string
  status: number
  durationMs: number
  companyId?: string
}

export default function TracesListPage() {
  const params = useParams<{ lang: string }>()
  const lang = normalizeLang(params?.lang)
  const [traces, setTraces] = useState<TraceMeta[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [auto, setAuto] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/proxy/v1/admin/traces')
      const data = await res.json()
      if (data?.error) throw new Error(data.error)
      setTraces(data.traces ?? [])
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])
  useEffect(() => {
    if (!auto) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [auto])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-[var(--text)]">Traces</h1>
        <button
          type="button"
          onClick={load}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          refresh
        </button>
        <label className="text-xs text-[var(--text-muted)] flex items-center gap-1">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          auto
        </label>
        <span className="ml-auto text-xs text-[var(--text-faint)]">
          {traces.length} captured
        </span>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        In-memory ring buffer (last 100). Traces are captured for any request
        sent with <code>X-Brain-Debug: 1</code> — Playground submits and
        scenario runs both qualify.
      </p>

      {error && (
        <div className="text-xs text-[var(--danger)] font-mono">{error}</div>
      )}

      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
            <th className="px-2 py-1">time</th>
            <th className="px-2 py-1">method</th>
            <th className="px-2 py-1">path</th>
            <th className="px-2 py-1">status</th>
            <th className="px-2 py-1 text-right">ms</th>
            <th className="px-2 py-1">tenant</th>
          </tr>
        </thead>
        <tbody>
          {traces.map((t) => (
            <tr
              key={t.requestId}
              className="border-b border-[var(--border)] hover:bg-[var(--bg-overlay)]"
            >
              <td className="px-2 py-1 font-mono text-[10px] text-[var(--text-faint)]">
                {new Date(t.ts).toLocaleTimeString()}
              </td>
              <td className="px-2 py-1 font-mono text-[var(--text-muted)]">
                {t.method}
              </td>
              <td className="px-2 py-1 font-mono">
                <Link
                  href={`/${lang}/admin/traces/${t.requestId}`}
                  className="text-[var(--accent)] hover:underline"
                >
                  {t.path}
                </Link>
              </td>
              <td
                className={`px-2 py-1 font-mono ${
                  t.status >= 400 ? 'text-[var(--danger)]' : 'text-[var(--text)]'
                }`}
              >
                {t.status}
              </td>
              <td className="px-2 py-1 font-mono text-right">{t.durationMs}</td>
              <td className="px-2 py-1 font-mono text-[10px] text-[var(--text-muted)]">
                {t.companyId ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && traces.length === 0 && (
        <div className="text-xs text-[var(--text-faint)] italic py-4">
          No traces yet. Submit something via Playground to see them.
        </div>
      )}
    </div>
  )
}
