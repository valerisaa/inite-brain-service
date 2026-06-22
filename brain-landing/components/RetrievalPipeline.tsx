import { Search, Sparkles } from 'lucide-react'
import { SectionHeading } from './DualPath'
import { getMessages, type Lang } from '../lib/i18n'

interface Props {
  lang: Lang
}

/**
 * The retrieval pipeline as a funnel of stages. Static, data-driven from
 * the locale. Each stage narrows the candidate set; the width bar shows
 * the funnel. This is the engine README calls the hybrid retrieval stack.
 */
export function RetrievalPipeline({ lang }: Props) {
  const t = getMessages(lang)
  const r = t.retrieval
  const stages = r.stages
  return (
    <section className="py-16 border-t border-[var(--border)]">
      <SectionHeading index="02" eyebrow={r.eyebrow} title={r.title} subtitle={r.subtitle} />

      <div className="mt-8 lab-panel rounded-xl p-6 sm:p-8">
        {/* query in */}
        <div className="flex items-center gap-2 u-mono text-[12px] text-[var(--data)]">
          <Search className="w-4 h-4" />
          {r.queryIn}
        </div>

        <ol className="mt-4 space-y-px">
          {stages.map((s, i) => {
            // funnel: bar shrinks as the candidate set narrows
            const w = 100 - (i / (stages.length - 1)) * 64
            return (
              <li
                key={i}
                className="relative grid grid-cols-[2.2rem_1fr] sm:grid-cols-[2.2rem_220px_1fr] gap-x-4 items-center py-2.5 border-l border-[var(--border-strong)] pl-4 ml-3"
              >
                <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-[var(--bg)] border border-[var(--signal)]" />
                <span className="u-mono text-[10px] text-[var(--signal)]">
                  S{String(i + 1).padStart(2, '0')}
                </span>
                <span className="u-mono text-[12.5px] text-[var(--text)]">{s.name}</span>
                <span className="hidden sm:block text-[12px] text-[var(--text-muted)] leading-snug">
                  {s.desc}
                </span>
                {/* funnel bar */}
                <span
                  className="col-start-2 sm:col-start-2 mt-1.5 h-1 rounded-full sm:hidden"
                  style={{
                    width: `${w}%`,
                    background: 'linear-gradient(90deg,var(--data),var(--signal))',
                    opacity: 0.5,
                  }}
                />
              </li>
            )
          })}
        </ol>

        {/* answer out */}
        <div className="mt-4 flex items-center gap-2 u-mono text-[12px] text-[var(--signal)]">
          <Sparkles className="w-4 h-4" />
          {r.answerOut}
        </div>

        <div className="mt-6 pt-5 border-t border-[var(--border)] u-mono text-[11px] text-[var(--text-faint)]">
          {r.note}
        </div>
      </div>
    </section>
  )
}
