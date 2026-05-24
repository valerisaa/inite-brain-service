'use client'

import { useState } from 'react'
import { usePlaygroundCall } from './usePlaygroundCall'
import { ResponseInspector } from './ResponseInspector'

interface MentionResult {
  skipped?: boolean
  reason?: string
  extractedEntityIds?: string[]
  extractedFactIds?: string[]
}

export function MentionForm() {
  const [text, setText] = useState(
    'Sarah Kim was promoted to senior designer at TriPay last month.',
  )
  const [vertical, setVertical] = useState('admin_playground')
  const [conversationId, setConversationId] = useState('')
  const call = usePlaygroundCall<MentionResult>()

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          call.send('v1/ingest/mention', {
            body: {
              text,
              contextRef: {
                vertical: vertical || 'admin_playground',
                conversationId: conversationId || undefined,
              },
              emittedAt: new Date().toISOString(),
            },
          })
        }}
        className="space-y-2"
      >
        <label className="block text-xs text-[var(--text-muted)]">Text</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="w-full border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-sm text-[var(--text)]"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-[var(--text-muted)]">
              Vertical
            </label>
            <input
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="w-full border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-sm font-mono text-[var(--text)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)]">
              conversationId (optional)
            </label>
            <input
              value={conversationId}
              onChange={(e) => setConversationId(e.target.value)}
              className="w-full border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-sm font-mono text-[var(--text)]"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={call.loading}
          className="px-3 py-1.5 rounded-md bg-[var(--accent)] text-white text-sm disabled:opacity-50"
        >
          {call.loading ? 'Extracting…' : 'POST /v1/ingest/mention'}
        </button>
        {call.durationMs != null && (
          <span className="ml-3 text-xs text-[var(--text-faint)]">
            {call.durationMs}ms
          </span>
        )}
      </form>

      {call.error && (
        <div className="text-xs text-[var(--danger)] font-mono whitespace-pre-wrap">
          {call.error}
        </div>
      )}

      {call.data && (
        <ResponseInspector
          raw={call.data}
          trace={call.trace}
          pretty={
            <div className="text-sm space-y-2">
              <div className="text-[var(--text-muted)]">
                {call.data.skipped ? (
                  <span className="text-[var(--warning)]">
                    skipped — {call.data.reason}
                  </span>
                ) : (
                  <span className="text-[var(--accent)]">
                    extracted{' '}
                    {call.data.extractedEntityIds?.length ?? 0} entities,{' '}
                    {call.data.extractedFactIds?.length ?? 0} facts
                  </span>
                )}
              </div>
              {call.data.extractedEntityIds?.length ? (
                <div>
                  <div className="text-xs text-[var(--text-faint)] uppercase tracking-wider mb-1">
                    entities
                  </div>
                  <ul className="space-y-0.5 text-xs font-mono">
                    {call.data.extractedEntityIds.map((id) => (
                      <li key={id} className="text-[var(--text)]">
                        {id}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {call.data.extractedFactIds?.length ? (
                <div>
                  <div className="text-xs text-[var(--text-faint)] uppercase tracking-wider mb-1">
                    facts
                  </div>
                  <ul className="space-y-0.5 text-xs font-mono">
                    {call.data.extractedFactIds.map((id) => (
                      <li key={id} className="text-[var(--text)]">
                        {id}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          }
        />
      )}
    </div>
  )
}
