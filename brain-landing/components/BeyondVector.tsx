import { X, Check } from 'lucide-react'
import { SectionHeading } from './DualPath'
import { getMessages, type Lang } from '../lib/i18n'

interface Props {
  lang: Lang
}

/**
 * Honest contrast — what an embeddings-only store does vs what Brain adds.
 * No competitor named; every row is a truthful capability difference.
 */
export function BeyondVector({ lang }: Props) {
  const t = getMessages(lang)
  const b = t.beyondVector
  return (
    <section className="py-16 border-t border-[var(--border)]">
      <SectionHeading index="03" eyebrow={b.eyebrow} title={b.title} subtitle={b.subtitle} />

      <div className="mt-8 lab-panel rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 border-b border-[var(--border)]">
          <div className="px-5 py-3 u-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-faint)] border-r border-[var(--border)]">
            {b.colA}
          </div>
          <div className="px-5 py-3 u-mono text-[11px] uppercase tracking-[0.14em] text-[var(--signal)]">
            {b.colB}
          </div>
        </div>
        {b.rows.map((row, i) => (
          <div
            key={i}
            className={`grid grid-cols-2 ${i < b.rows.length - 1 ? 'border-b border-[var(--border)]' : ''}`}
          >
            <div className="px-5 py-3.5 flex items-start gap-2 border-r border-[var(--border)] text-[13px] text-[var(--text-faint)]">
              <X className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--text-faint)]" />
              {row.a}
            </div>
            <div className="px-5 py-3.5 flex items-start gap-2 text-[13px] text-[var(--text-muted)]">
              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--signal)]" />
              {row.b}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
