'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, AlertCircle } from 'lucide-react'

export interface DebugSpan {
  id: string
  parentId?: string
  name: string
  startedAt: number
  durationMs?: number
  attributes?: Record<string, unknown>
  error?: string
}

export interface DebugArtifact {
  spanId?: string
  name: string
  ts: number
  value: unknown
}

export interface DebugTracePayload {
  requestId: string
  totalMs: number
  spans: DebugSpan[]
  artifacts: DebugArtifact[]
}

interface Props {
  trace: DebugTracePayload | null | undefined
}

interface TreeNode {
  span: DebugSpan
  children: TreeNode[]
}

function buildTree(spans: DebugSpan[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const s of spans) byId.set(s.id, { span: s, children: [] })
  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    const p = node.span.parentId ? byId.get(node.span.parentId) : undefined
    if (p) p.children.push(node)
    else roots.push(node)
  }
  return roots
}

export function TraceWaterfall({ trace }: Props) {
  if (!trace) {
    return (
      <div className="text-xs text-[var(--text-faint)] italic px-2 py-3">
        No trace captured. Ensure the request was sent with ?debug=1.
      </div>
    )
  }
  const tree = useMemo(() => buildTree(trace.spans), [trace.spans])
  const artifactsBySpan = useMemo(() => {
    const m = new Map<string, DebugArtifact[]>()
    for (const a of trace.artifacts) {
      const key = a.spanId ?? '__top'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(a)
    }
    return m
  }, [trace.artifacts])

  const baseStart = trace.spans.length
    ? Math.min(...trace.spans.map((s) => s.startedAt))
    : 0

  return (
    <div className="text-xs font-mono">
      <div className="mb-2 text-[var(--text-muted)]">
        request <span className="text-[var(--text)]">{trace.requestId.slice(0, 8)}</span>
        {' · '}
        total <span className="text-[var(--text)]">{trace.totalMs}ms</span>
        {' · '}
        spans <span className="text-[var(--text)]">{trace.spans.length}</span>
        {' · '}
        artifacts <span className="text-[var(--text)]">{trace.artifacts.length}</span>
      </div>
      {tree.length === 0 && (
        <div className="text-[var(--text-faint)] italic">
          No spans recorded. Wider instrumentation needed.
        </div>
      )}
      {tree.map((node) => (
        <SpanNode
          key={node.span.id}
          node={node}
          depth={0}
          baseStart={baseStart}
          totalMs={trace.totalMs}
          artifactsBySpan={artifactsBySpan}
        />
      ))}
    </div>
  )
}

function SpanNode({
  node,
  depth,
  baseStart,
  totalMs,
  artifactsBySpan,
}: {
  node: TreeNode
  depth: number
  baseStart: number
  totalMs: number
  artifactsBySpan: Map<string, DebugArtifact[]>
}) {
  const [open, setOpen] = useState(depth < 1)
  const offset = node.span.startedAt - baseStart
  const widthMs = node.span.durationMs ?? 0
  const pctLeft = totalMs > 0 ? (offset / totalMs) * 100 : 0
  const pctW = totalMs > 0 ? Math.max((widthMs / totalMs) * 100, 0.5) : 0
  const artifacts = artifactsBySpan.get(node.span.id) ?? []

  return (
    <div className="border-l border-[var(--border)] pl-1 my-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 w-full text-left hover:bg-[var(--bg-overlay)] py-0.5 px-1 rounded"
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        <ChevronRight
          className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-[var(--text)] truncate">{node.span.name}</span>
        {node.span.error && (
          <AlertCircle className="w-3 h-3 text-[var(--danger)]" />
        )}
        <span className="ml-2 text-[var(--text-faint)] tabular-nums">
          {widthMs}ms
        </span>
      </button>

      <div className="relative h-1 mt-0.5 ml-2 mb-1">
        <div className="absolute inset-0 bg-[var(--bg-overlay)] rounded" />
        <div
          className={`absolute top-0 bottom-0 rounded ${
            node.span.error ? 'bg-[var(--danger)]' : 'bg-[var(--accent)]'
          }`}
          style={{ left: `${pctLeft}%`, width: `${pctW}%` }}
        />
      </div>

      {open && (
        <div className="ml-4 mt-1 space-y-1">
          {node.span.attributes &&
            Object.keys(node.span.attributes).length > 0 && (
              <div className="text-[var(--text-faint)]">
                attrs:{' '}
                {Object.entries(node.span.attributes).map(([k, v]) => (
                  <span key={k} className="mr-2">
                    <span className="text-[var(--text-muted)]">{k}=</span>
                    {String(v)}
                  </span>
                ))}
              </div>
            )}
          {node.span.error && (
            <div className="text-[var(--danger)]">error: {node.span.error}</div>
          )}
          {artifacts.map((a, i) => (
            <ArtifactBlock key={`${a.name}-${i}`} artifact={a} />
          ))}
          {node.children.map((c) => (
            <SpanNode
              key={c.span.id}
              node={c}
              depth={depth + 1}
              baseStart={baseStart}
              totalMs={totalMs}
              artifactsBySpan={artifactsBySpan}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ArtifactBlock({ artifact }: { artifact: DebugArtifact }) {
  const [open, setOpen] = useState(false)
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(artifact.value, null, 2)
    } catch {
      return String(artifact.value)
    }
  }, [artifact.value])
  return (
    <div className="border border-[var(--border)] rounded">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-2 py-1 text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] flex items-center gap-1"
      >
        <ChevronRight
          className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        artifact: <span className="text-[var(--text)]">{artifact.name}</span>
      </button>
      {open && (
        <pre className="px-2 py-1 max-h-72 overflow-auto text-[10px] bg-[var(--bg)] whitespace-pre-wrap">
          {formatted}
        </pre>
      )}
    </div>
  )
}
