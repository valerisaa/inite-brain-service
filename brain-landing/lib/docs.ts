import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_LANG, type Lang } from './i18n'

/**
 * Docs content collection at `content/docs/<lang>/<slug>.mdx`. English is
 * canonical; a missing localized file falls back to English and flags it so
 * the page can show a "translation pending" banner. Read at build time.
 */
const DOCS_DIR = path.join(process.cwd(), 'content', 'docs')

export function getDocContent(
  slug: string,
  lang: Lang,
): { content: string; fallback: boolean } | null {
  const localized = path.join(DOCS_DIR, lang, `${slug}.mdx`)
  if (fs.existsSync(localized)) {
    return { content: fs.readFileSync(localized, 'utf8'), fallback: false }
  }
  const en = path.join(DOCS_DIR, DEFAULT_LANG, `${slug}.mdx`)
  if (fs.existsSync(en)) {
    return { content: fs.readFileSync(en, 'utf8'), fallback: lang !== DEFAULT_LANG }
  }
  return null
}
