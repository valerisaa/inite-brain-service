'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ScenarioRunResultView,
  ScenarioRunOutcome,
} from '../../../../../components/scenarios/ScenarioRunResultView'
import { JsonView } from '../../../../../components/admin/JsonView'
import { normalizeLang } from '../../../../../lib/i18n'

export default function ScenarioDetailPage() {
  const params = useParams<{ id: string; lang: string }>()
  const id = decodeURIComponent(params?.id ?? '')
  const lang = normalizeLang(params?.lang)
  const [spec, setSpec] = useState<any>(null)
  const [outcome, setOutcome] = useState<ScenarioRunOutcome | null>(null)
  const [running, setRunning] = useState(false)
  const [keepTenant, setKeepTenant] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/api/admin/proxy/v1/admin/scenarios/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) throw new Error(d.error)
        setSpec(d)
      })
      .catch((e) => setError((e as Error).message))
  }, [id])

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/proxy/v1/admin/scenarios/${encodeURIComponent(id)}/run`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keepTenant }),
        },
      )
      const data = (await res.json()) as ScenarioRunOutcome | { error?: string }
      if (!res.ok) throw new Error((data as any).error ?? `${res.status}`)
      setOutcome(data as ScenarioRunOutcome)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <Link
          href={`/${lang}/admin/scenarios`}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          ← scenarios
        </Link>
      </div>

      <div>
        <h1 className="text-base font-mono text-[var(--text)]">{id}</h1>
        <p className="text-xs text-[var(--text-muted)]">
          {spec?.description}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="px-3 py-1.5 rounded-md bg-[var(--accent)] text-white text-sm disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run scenario'}
        </button>
        <label className="text-xs text-[var(--text-muted)] flex items-center gap-1">
          <input
            type="checkbox"
            checked={keepTenant}
            onChange={(e) => setKeepTenant(e.target.checked)}
          />
          keep ephemeral tenant after run (for debug)
        </label>
      </div>

      {error && (
        <div className="text-xs text-[var(--danger)] font-mono">{error}</div>
      )}

      {outcome && <ScenarioRunResultView outcome={outcome} />}

      {spec && (
        <details className="border border-[var(--border)] rounded-md">
          <summary className="px-3 py-2 text-xs text-[var(--text-muted)] cursor-pointer">
            Scenario spec ({spec.setup?.length ?? 0} setup steps,{' '}
            {spec.queries?.length ?? 0} queries)
          </summary>
          <div className="px-3 py-2 max-h-[32rem] overflow-auto">
            <JsonView value={spec} />
          </div>
        </details>
      )}
    </div>
  )
}
