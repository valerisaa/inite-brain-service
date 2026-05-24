'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ScenarioCard,
  ScenarioSummary,
} from '../../../../components/scenarios/ScenarioCard'

export default function ScenariosListPage() {
  const [items, setItems] = useState<ScenarioSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [vertical, setVertical] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch('/api/admin/proxy/v1/admin/scenarios')
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) throw new Error(data.error)
        setItems(data.scenarios ?? [])
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [])

  const verticals = useMemo(
    () => Array.from(new Set(items.map((s) => s.vertical))).sort(),
    [items],
  )
  const filtered = useMemo(
    () =>
      items.filter(
        (s) =>
          (!vertical || s.vertical === vertical) &&
          (!q ||
            s.id.toLowerCase().includes(q.toLowerCase()) ||
            s.description.toLowerCase().includes(q.toLowerCase())),
      ),
    [items, q, vertical],
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-[var(--text)]">
          Scenarios
        </h1>
        <p className="text-xs text-[var(--text-muted)]">
          {items.length} scenarios loaded from <code>test/eval/scenarios</code>.
          Each run defaults to an ephemeral tenant — no risk of polluting
          existing data.
        </p>
      </div>

      <div className="flex gap-2 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filter id / description"
          className="flex-1 max-w-xs border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-sm text-[var(--text)]"
        />
        <select
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
          className="border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-sm text-[var(--text)]"
        >
          <option value="">all verticals</option>
          {verticals.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-faint)]">
          {filtered.length} shown
        </span>
      </div>

      {loading && (
        <div className="text-xs text-[var(--text-muted)]">Loading…</div>
      )}
      {error && (
        <div className="text-xs text-[var(--danger)]">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.map((s) => (
          <ScenarioCard key={s.id} s={s} />
        ))}
      </div>
    </div>
  )
}
