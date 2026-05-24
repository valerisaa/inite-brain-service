'use client'

import { useState, useCallback } from 'react'
import type { DebugTracePayload } from './TraceWaterfall'

export interface PlaygroundCallState<T> {
  loading: boolean
  data: T | null
  trace: DebugTracePayload | null
  error: string | null
  durationMs: number | null
}

/**
 * Hook that POST/GETs a brain endpoint via the admin BFF with
 * ?debug=1 appended. Splits the JSON response into `data` (the
 * brain result with the synthetic `__trace` field stripped) and
 * `trace` (the per-request debug-mode waterfall).
 */
export function usePlaygroundCall<T = unknown>() {
  const [state, setState] = useState<PlaygroundCallState<T>>({
    loading: false,
    data: null,
    trace: null,
    error: null,
    durationMs: null,
  })

  const send = useCallback(
    async (
      path: string,
      init: { method?: 'GET' | 'POST'; body?: unknown } = {},
    ) => {
      setState((s) => ({ ...s, loading: true, error: null }))
      const t0 = Date.now()
      try {
        const sep = path.includes('?') ? '&' : '?'
        const url = `/api/admin/proxy/${path.replace(/^\/+/, '')}${sep}debug=1`
        const res = await fetch(url, {
          method: init.method ?? 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: init.body ? JSON.stringify(init.body) : undefined,
        })
        const json = (await res.json()) as Record<string, any>
        const trace = (json?.__trace as DebugTracePayload) ?? null
        const rest: Record<string, any> = { ...json }
        delete rest.__trace
        if (!res.ok) {
          setState({
            loading: false,
            data: null,
            trace,
            error: rest.error ?? `${res.status} ${res.statusText}`,
            durationMs: Date.now() - t0,
          })
          return
        }
        setState({
          loading: false,
          data: rest as T,
          trace,
          error: null,
          durationMs: Date.now() - t0,
        })
      } catch (err) {
        setState({
          loading: false,
          data: null,
          trace: null,
          error: (err as Error).message,
          durationMs: Date.now() - t0,
        })
      }
    },
    [],
  )

  return { ...state, send }
}
