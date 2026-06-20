'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  CheckCircle2,
  Loader2,
  Radio,
  RefreshCw,
  StopCircle,
  XCircle,
} from 'lucide-react'
import { JsonView } from './JsonView'

interface JobRow {
  runId: string
  jobType: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  triggeredBy: 'cron' | 'manual' | 'startup'
  triggeredByActor?: string | null
  startedAt: string
  finishedAt?: string | null
  progress?: Record<string, unknown> | null
  result?: Record<string, unknown> | null
  error?: { message: string; name?: string } | null
  cancelRequested?: boolean
  companyId: string
}

const JOB_TYPES = [
  '',
  'dreams',
  'compaction',
  'calibration_refit',
  'source_trust_refit',
  'reindex_embeddings',
  'changefeed_drain',
]
const STATUSES = ['', 'running', 'succeeded', 'failed', 'cancelled']

export function JobsPanel() {
  const searchParams = useSearchParams()
  const initialRunId = searchParams?.get('runId') ?? null
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(initialRunId)
  const [filter, setFilter] = useState({
    jobType: '',
    status: '',
    companyId: '',
  })
  const [live, setLive] = useState(true)
  const [sseStatus, setSseStatus] = useState<'idle' | 'open' | 'closed'>('idle')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter.jobType) params.set('jobType', filter.jobType)
      if (filter.status) params.set('status', filter.status)
      if (filter.companyId) params.set('companyId', filter.companyId)
      params.set('limit', '200')
      const res = await fetch(
        `/api/admin/proxy/v1/admin/jobs?${params.toString()}`,
        { cache: 'no-store' },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Failed ${res.status}`)
      setJobs(data.jobs ?? [])
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!live) {
      setSseStatus('idle')
      return
    }
    const url = '/api/admin/sse/v1/admin/jobs/stream'
    const src = new EventSource(url)
    setSseStatus('open')
    src.onmessage = (e) => {
      try {
        const j = JSON.parse(e.data) as JobRow
        setJobs((prev) => {
          const idx = prev.findIndex((p) => p.runId === j.runId)
          if (idx < 0) return [j, ...prev].slice(0, 200)
          const next = [...prev]
          next[idx] = j
          return next
        })
      } catch {
        // ignore malformed frame
      }
    }
    src.onerror = () => setSseStatus('closed')
    return () => {
      src.close()
      setSseStatus('idle')
    }
  }, [live])

  const selectedJob = useMemo(
    () => jobs.find((j) => j.runId === selected) ?? null,
    [jobs, selected],
  )

  const cancel = useCallback(async (job: JobRow) => {
    try {
      await fetch(
        `/api/admin/proxy/v1/admin/jobs/${encodeURIComponent(job.runId)}/cancel`,
        { method: 'POST' },
      )
    } catch {
      // best-effort
    }
  }, [])

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-base font-semibold text-[var(--text)]">
            Job runs
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Long-running operator jobs (dreams / compaction / calibration refit
            / reindex / changefeed drain). SSE-streamed transitions; per-job
            drill shows progress / result / error.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => void load()}
            className="text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            refresh
          </button>
          <label className="flex items-center gap-1 text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
            />
            live
            <span
              className={`ml-1 inline-block w-1.5 h-1.5 rounded-full ${
                sseStatus === 'open'
                  ? 'bg-[var(--success)]'
                  : sseStatus === 'closed'
                    ? 'bg-[var(--danger)]'
                    : 'bg-[var(--text-faint)]'
              }`}
            />
          </label>
        </div>
      </header>

      <div className="flex gap-2 items-center flex-wrap text-xs">
        <select
          value={filter.jobType}
          onChange={(e) => setFilter((f) => ({ ...f, jobType: e.target.value }))}
          className="border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-[var(--text)]"
        >
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>
              {t || 'all types'}
            </option>
          ))}
        </select>
        <select
          value={filter.status}
          onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
          className="border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-[var(--text)]"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || 'all statuses'}
            </option>
          ))}
        </select>
        <input
          placeholder="companyId filter"
          value={filter.companyId}
          onChange={(e) =>
            setFilter((f) => ({ ...f, companyId: e.target.value }))
          }
          className="border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-[var(--text)] font-mono w-44"
        />
        <span className="text-[10px] text-[var(--text-faint)] flex items-center gap-1">
          <Radio className="w-3 h-3" /> live SSE on accepted job_run
          transitions
        </span>
      </div>

      {error && (
        <div className="text-xs text-[var(--danger)] font-mono">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-3">
        <div className="rounded-md border border-[var(--border)] overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-overlay)] text-[var(--text-faint)] text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">started</th>
                <th className="text-left px-3 py-2">type</th>
                <th className="text-left px-3 py-2">tenant</th>
                <th className="text-left px-3 py-2">trigger</th>
                <th className="text-left px-3 py-2">status</th>
                <th className="text-right px-3 py-2">duration</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr
                  key={j.runId}
                  className={`border-t border-[var(--border)] hover:bg-[var(--bg-overlay)]/40 cursor-pointer ${
                    selected === j.runId ? 'bg-[var(--bg-overlay)]/60' : ''
                  }`}
                  onClick={() => setSelected(j.runId)}
                >
                  <td className="px-3 py-1.5 font-mono text-[10px] text-[var(--text-muted)]">
                    {new Date(j.startedAt)
                      .toISOString()
                      .slice(0, 19)
                      .replace('T', ' ')}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[var(--text)]">
                    {j.jobType}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-[var(--text-muted)]">
                    {j.companyId}
                  </td>
                  <td className="px-3 py-1.5 text-[10px] font-mono text-[var(--text-faint)]">
                    {j.triggeredBy}
                  </td>
                  <td className="px-3 py-1.5">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-[10px] tabular-nums">
                    {j.finishedAt
                      ? `${Math.round((new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime()) / 100) / 10}s`
                      : '—'}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-4 text-center text-[var(--text-muted)] italic"
                  >
                    No matching job runs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <aside className="border border-[var(--border)] rounded-md p-3 bg-[var(--bg-elevated)] max-h-[70vh] overflow-y-auto">
          {selectedJob ? (
            <JobDetail job={selectedJob} onCancel={() => void cancel(selectedJob)} />
          ) : (
            <div className="text-xs text-[var(--text-muted)] italic">
              Pick a job to drill.
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: JobRow['status'] }) {
  const tone =
    status === 'succeeded'
      ? 'text-[var(--success)] bg-[var(--success)]/10'
      : status === 'failed'
        ? 'text-[var(--danger)] bg-[var(--danger)]/10'
        : status === 'running'
          ? 'text-[var(--accent)] bg-[var(--accent)]/10'
          : status === 'cancelled'
            ? 'text-[var(--warning)] bg-[var(--warning)]/10'
            : 'text-[var(--text-faint)] bg-[var(--bg-overlay)]'
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${tone}`}>
      {status}
    </span>
  )
}

function JobDetail({
  job,
  onCancel,
}: {
  job: JobRow
  onCancel: () => void
}) {
  return (
    <div className="space-y-3 text-xs">
      <header className="flex items-baseline gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[var(--text)]">{job.jobType}</div>
          <div className="text-[10px] text-[var(--text-faint)] font-mono truncate">
            {job.runId}
          </div>
        </div>
        <StatusBadge status={job.status} />
      </header>
      <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
        <Cell label="trigger" value={job.triggeredBy} />
        <Cell label="actor" value={job.triggeredByActor ?? '—'} />
        <Cell label="tenant" value={job.companyId} />
        <Cell
          label="started"
          value={new Date(job.startedAt).toISOString().slice(0, 19).replace('T', ' ')}
        />
        {job.finishedAt && (
          <Cell
            label="finished"
            value={new Date(job.finishedAt).toISOString().slice(0, 19).replace('T', ' ')}
          />
        )}
      </div>
      {job.status === 'running' && (
        <button
          type="button"
          onClick={onCancel}
          disabled={job.cancelRequested}
          className="px-2 py-1 rounded text-[10px] bg-[var(--danger)] text-white flex items-center gap-1 disabled:opacity-40"
        >
          {job.cancelRequested ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <StopCircle className="w-3 h-3" />
          )}
          {job.cancelRequested ? 'cancel requested' : 'Request cancel'}
        </button>
      )}
      {job.progress && (
        <section>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-1">
            progress
          </div>
          <JsonView value={job.progress} />
        </section>
      )}
      {job.result && (
        <section>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-[var(--success)]" /> result
          </div>
          <JsonView value={job.result} />
        </section>
      )}
      {job.error && (
        <section>
          <div className="text-[10px] uppercase tracking-wider text-[var(--danger)] mb-1 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> error
          </div>
          <div className="text-[10px] text-[var(--danger)] font-mono">
            {job.error.message}
          </div>
        </section>
      )}
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">
        {label}
      </div>
      <div className="text-[var(--text)] truncate">{value}</div>
    </div>
  )
}
