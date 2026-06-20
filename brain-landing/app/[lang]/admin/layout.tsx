'use client'

import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'
import { ReactNode, useState } from 'react'
import {
  Activity,
  CalendarClock,
  ClipboardList,
  Coins,
  Cpu,
  FlaskConical,
  Gauge,
  History,
  ListChecks,
  Menu,
  Moon,
  Network,
  Presentation,
  Play,
  Sigma,
  Tags,
  UserRound,
  Waypoints,
  X,
} from 'lucide-react'
import { CommandPalette } from '../../../components/admin/CommandPalette'
import { Header } from '../../../components/Header'
import { useAuth } from '../../../hooks/useAuth'
import { normalizeLang } from '../../../lib/i18n'

interface Props {
  children: ReactNode
}

interface Section {
  slug: string
  title: string
  icon: typeof Activity
}

interface Group {
  label: string
  items: Section[]
}

const GROUPS: Group[] = [
  {
    label: 'Ops',
    items: [
      { slug: 'explore/overview', title: 'Overview', icon: Activity },
      { slug: 'maintenance', title: 'Maintenance', icon: CalendarClock },
      { slug: 'jobs', title: 'Jobs', icon: Play },
      { slug: 'dreams', title: 'Dreams', icon: Moon },
      { slug: 'cost', title: 'Cost', icon: Coins },
      { slug: 'audit', title: 'Audit log', icon: History },
      { slug: 'router', title: 'Router / cache', icon: Gauge },
      { slug: 'predicates', title: 'Predicates', icon: Tags },
    ],
  },
  {
    label: 'Eval',
    items: [
      { slug: 'scenarios', title: 'Scenarios', icon: ListChecks },
      { slug: 'baselines', title: 'Baselines', icon: ClipboardList },
      { slug: 'calibration', title: 'Calibration', icon: Sigma },
      { slug: 'traces', title: 'Traces', icon: Waypoints },
    ],
  },
  {
    label: 'Dev',
    items: [
      { slug: 'playground', title: 'Playground', icon: FlaskConical },
      { slug: 'explore/graph', title: 'Graph explorer', icon: Network },
      { slug: 'reindex', title: 'Reindex', icon: Cpu },
    ],
  },
  {
    label: 'Live',
    items: [{ slug: 'demo', title: 'Demo deck', icon: Presentation }],
  },
]

export default function AdminLayout({ children }: Props) {
  const params = useParams<{ lang: string }>()
  const lang = normalizeLang(params?.lang)
  const pathname = usePathname() ?? ''
  const auth = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (!auth.loading && !auth.isAdmin) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="max-w-md text-center px-4">
          <h1 className="text-xl font-semibold text-[var(--text)]">
            Admin sign-in required
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            This area is restricted to brain operators. Sign in through
            <code className="ml-1 text-[var(--accent)]">auth.inite.ai</code>{' '}
            with an account that has <code>metadata.isAdmin = true</code>.
          </p>
        </div>
      </div>
    )
  }

  const adminPath = pathname.replace(/^\/+(en|ru)\/admin\/?/, '')
  const currentSlug = adminPath.startsWith('explore/')
    ? adminPath.split('/').slice(0, 2).join('/')
    : adminPath.split('/')[0]

  const closeNav = () => setMobileNavOpen(false)

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header lang={lang} context="Admin" />

      <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/60 backdrop-blur sticky top-12 z-20">
        <div className="max-w-7xl mx-auto px-4 h-10 flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-overlay)]"
            aria-label="Open navigation"
          >
            <Menu className="w-4 h-4" />
          </button>
          <CommandPalette lang={lang} />
          <div className="ml-auto flex items-center gap-2 text-[var(--text-muted)]">
            {auth.email && (
              <span className="hidden sm:flex items-center gap-1">
                <UserRound className="w-3 h-3 text-[var(--text-faint)]" />
                <span className="font-mono">{auth.email}</span>
              </span>
            )}
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                auth.isAdmin
                  ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'bg-[var(--bg-overlay)] text-[var(--text-faint)]'
              }`}
            >
              {auth.loading ? '…' : auth.isAdmin ? 'brain:admin' : 'no admin'}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:grid md:grid-cols-[14rem_1fr] md:gap-6">
        <aside className="hidden md:block sticky top-[5.5rem] self-start py-6 max-h-[calc(100vh-5.5rem)] overflow-y-auto">
          <NavGroups
            currentSlug={currentSlug}
            lang={lang}
            onNavigate={closeNav}
          />
        </aside>

        {mobileNavOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/60 flex"
            onClick={closeNav}
          >
            <aside
              className="bg-[var(--bg-elevated)] w-64 max-w-[80vw] h-full overflow-y-auto p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-wider text-[var(--text-faint)]">
                  Admin
                </span>
                <button
                  type="button"
                  onClick={closeNav}
                  className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text)]"
                  aria-label="Close navigation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <NavGroups
                currentSlug={currentSlug}
                lang={lang}
                onNavigate={closeNav}
              />
            </aside>
          </div>
        )}

        <main className="py-6 min-w-0">{children}</main>
      </div>
    </div>
  )
}

function NavGroups({
  currentSlug,
  lang,
  onNavigate,
}: {
  currentSlug: string
  lang: string
  onNavigate: () => void
}) {
  return (
    <nav aria-label="Admin sections" className="space-y-3">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <div className="px-2.5 mb-1 text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
            {g.label}
          </div>
          <div className="space-y-0.5">
            {g.items.map((s) => {
              const active = currentSlug === s.slug
              const Icon = s.icon
              return (
                <Link
                  key={s.slug}
                  href={`/${lang}/admin/${s.slug}`}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                    active
                      ? 'bg-[var(--bg-overlay)] text-[var(--text)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-overlay)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {s.title}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
