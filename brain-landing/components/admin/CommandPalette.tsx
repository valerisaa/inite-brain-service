'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import {
  Activity,
  ClipboardList,
  Coins,
  Cpu,
  FlaskConical,
  Gauge,
  History,
  ListChecks,
  Network,
  Presentation,
  Search,
  Sigma,
  Tags,
  Waypoints,
} from 'lucide-react'

interface PaletteEntry {
  id: string
  label: string
  hint?: string
  icon: typeof Activity
  /** absolute path including lang segment */
  path?: string
  /** custom action; used for non-nav commands */
  run?: () => void
  keywords?: string[]
}

export function CommandPalette({ lang }: { lang: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const go = (path: string) => {
    setOpen(false)
    setSearch('')
    router.push(path)
  }

  const entries: PaletteEntry[] = [
    {
      id: 'overview',
      label: 'Overview',
      hint: 'tenants · counters · health',
      icon: Activity,
      path: `/${lang}/admin/explore/overview`,
    },
    {
      id: 'cost',
      label: 'Cost',
      hint: 'per model / op',
      icon: Coins,
      path: `/${lang}/admin/cost`,
    },
    {
      id: 'audit',
      label: 'Audit log',
      hint: 'CHANGEFEED tail',
      icon: History,
      path: `/${lang}/admin/audit`,
    },
    {
      id: 'router',
      label: 'Router / cache',
      hint: 'hit rate · embedder · intent',
      icon: Gauge,
      path: `/${lang}/admin/router`,
    },
    {
      id: 'predicates',
      label: 'Predicates',
      hint: 'CRUD · alias · promote',
      icon: Tags,
      path: `/${lang}/admin/predicates`,
    },
    {
      id: 'scenarios',
      label: 'Scenarios',
      hint: 'batch-run · slice',
      icon: ListChecks,
      path: `/${lang}/admin/scenarios`,
    },
    {
      id: 'baselines',
      label: 'Baselines',
      hint: 'snapshot · diff',
      icon: ClipboardList,
      path: `/${lang}/admin/baselines`,
    },
    {
      id: 'calibration',
      label: 'Calibration',
      hint: 'reliability · ECE · Brier',
      icon: Sigma,
      path: `/${lang}/admin/calibration`,
    },
    {
      id: 'traces',
      label: 'Traces',
      hint: 'live SSE',
      icon: Waypoints,
      path: `/${lang}/admin/traces`,
    },
    {
      id: 'playground',
      label: 'Playground',
      hint: 'mention · search · synth',
      icon: FlaskConical,
      path: `/${lang}/admin/playground`,
    },
    {
      id: 'graph',
      label: 'Graph explorer',
      hint: 'bitemporal · PPR',
      icon: Network,
      path: `/${lang}/admin/explore/graph`,
      keywords: ['ppr', 'entity', 'graph'],
    },
    {
      id: 'reindex',
      label: 'Reindex / drop tenant',
      hint: 'destructive ops',
      icon: Cpu,
      path: `/${lang}/admin/reindex`,
      keywords: ['drop', 'embeddings', 'destructive'],
    },
    {
      id: 'demo',
      label: 'Demo deck',
      hint: '7 slides',
      icon: Presentation,
      path: `/${lang}/admin/demo`,
    },
  ]

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-1.5 text-[var(--text-faint)] hover:text-[var(--text)] text-xs border border-[var(--border)] rounded-md px-2 py-1"
        title="Open command palette"
      >
        <Search className="w-3 h-3" />
        <span>Search</span>
        <span className="ml-2 text-[10px] font-mono opacity-70">⌘K</span>
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[10vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          label="Admin command palette"
          shouldFilter
          value={undefined}
          onValueChange={undefined}
        >
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Type a command or section…"
            autoFocus
            className="w-full px-3 py-2 bg-transparent border-b border-[var(--border)] text-sm text-[var(--text)] focus:outline-none"
          />
          <Command.List className="max-h-[60vh] overflow-y-auto py-1">
            <Command.Empty className="px-3 py-3 text-xs text-[var(--text-faint)] italic">
              No matches.
            </Command.Empty>
            {entries.map((e) => {
              const Icon = e.icon
              return (
                <Command.Item
                  key={e.id}
                  value={`${e.label} ${e.hint ?? ''} ${(e.keywords ?? []).join(' ')}`}
                  onSelect={() => {
                    if (e.path) go(e.path)
                    else e.run?.()
                  }}
                  className="px-3 py-1.5 flex items-center gap-2 text-sm text-[var(--text-muted)] aria-selected:bg-[var(--bg-overlay)] aria-selected:text-[var(--text)] cursor-pointer"
                >
                  <Icon className="w-3.5 h-3.5 text-[var(--text-faint)]" />
                  <span className="text-[var(--text)]">{e.label}</span>
                  {e.hint && (
                    <span className="text-[10px] text-[var(--text-faint)] ml-auto">
                      {e.hint}
                    </span>
                  )}
                </Command.Item>
              )
            })}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
