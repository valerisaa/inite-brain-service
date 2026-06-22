import { METRICS, PER_VERTICAL, CORRECTNESS } from '../lib/metrics'
import { SectionHeading } from './DualPath'
import { getMessages, type Lang } from '../lib/i18n'

interface Props {
  lang: Lang
}

function num(s: string): number {
  const m = s.match(/[\d.]+/)
  return m ? parseFloat(m[0]) : 0
}

export function Stats({ lang }: Props) {
  const t = getMessages(lang)
  return (
    <section className="py-16 border-t border-[var(--border)]">
      <SectionHeading
        index="06"
        eyebrow={t.stats.eyebrow}
        title={t.stats.title}
        subtitle={t.stats.subtitle}
      />

      {/* retrieval headline metrics */}
      <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {METRICS.map((m) => {
          const value = num(m.value)
          return (
            <div key={m.label} className="lab-panel rounded-lg p-5" title={m.hint}>
              <div className="u-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
                {m.label}
              </div>
              <div className="mt-2 u-display text-3xl font-bold tracking-tight text-[var(--text)] tabular-nums">
                {m.value}
              </div>
              <div className="relative mt-3 h-1.5 rounded-full bg-[var(--border-strong)] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.min(value, 1) * 100}%`,
                    background: 'linear-gradient(90deg, var(--data), var(--signal))',
                  }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between u-mono text-[9.5px] text-[var(--text-faint)]">
                <span>95% CI {m.ci}</span>
                <span>
                  {t.stats.gateLabel} {m.floor}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* per-vertical recall@1 + correctness */}
      <div className="mt-3 grid lg:grid-cols-[1.4fr_1fr] gap-3">
        <div className="lab-panel rounded-lg p-5">
          <div className="u-eyebrow">{t.stats.byVertical}</div>
          <div className="mt-4 space-y-2.5">
            {PER_VERTICAL.map((v) => (
              <div key={v.vertical} className="flex items-center gap-3">
                <span className="u-mono text-[11px] text-[var(--text-muted)] w-16 shrink-0">
                  {v.vertical}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-[var(--border-strong)] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${v.value * 100}%`,
                      background: 'linear-gradient(90deg, var(--data), var(--signal))',
                    }}
                  />
                </div>
                <span className="u-mono text-[11px] text-[var(--text)] tabular-nums w-10 text-right">
                  {v.value.toFixed(3).replace(/^0/, '.')}
                </span>
                <span className="u-mono text-[9.5px] text-[var(--text-faint)] w-12 text-right">
                  n={v.n}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lab-panel rounded-lg p-5">
          <div className="u-eyebrow">{t.stats.correctness}</div>
          <div className="mt-4 space-y-2.5">
            {CORRECTNESS.map((c) => (
              <div
                key={c.label}
                className="flex items-center justify-between border-b border-[var(--border)] pb-2 last:border-0 last:pb-0"
              >
                <span className="u-mono text-[11.5px] text-[var(--text-muted)]">{c.label}</span>
                <span className="u-mono text-[12px] text-[var(--success)] tabular-nums">
                  {c.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-5 u-mono text-[11px] text-[var(--text-faint)]">{t.stats.footnote}</p>
    </section>
  )
}
