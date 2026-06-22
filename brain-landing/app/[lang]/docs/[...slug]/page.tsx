import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import { mdxComponents } from '../../../../mdx-components'
import { getMessages, normalizeLang, LANGS } from '../../../../lib/i18n'
import { DOCS_PAGES, findDocPage } from '../../../../lib/docs-nav'
import { getDocContent } from '../../../../lib/docs'
import { SITE_URL, ogImage } from '../../../../lib/seo'

export const dynamicParams = false

interface Props {
  params: Promise<{ lang: string; slug: string[] }>
}

export function generateStaticParams() {
  return LANGS.flatMap((lang) =>
    DOCS_PAGES.map((p) => ({ lang, slug: p.slug.split('/') })),
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: raw, slug: slugArr } = await params
  const lang = normalizeLang(raw)
  const slug = slugArr.join('/')
  const page = findDocPage(slug)
  const t = getMessages(lang)
  const meta = page ? t.docs.pages[page.key as keyof typeof t.docs.pages] : undefined
  const title = meta?.title ?? slug
  const description = meta?.description ?? ''
  const url = `${SITE_URL}/${lang}/docs/${slug}`
  const og = ogImage({ title, kicker: 'DOCS', kind: 'docs' })
  return {
    title: `${title} · INITE Brain Docs`,
    description,
    alternates: {
      canonical: url,
      languages: Object.fromEntries(
        LANGS.map((l) => [l, `${SITE_URL}/${l}/docs/${slug}`]),
      ),
    },
    openGraph: { title, description, url, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', images: [og] },
  }
}

export default async function DocPage({ params }: Props) {
  const { lang: raw, slug: slugArr } = await params
  const lang = normalizeLang(raw)
  const slug = slugArr.join('/')
  const doc = getDocContent(slug, lang)
  if (!doc) notFound()
  const t = getMessages(lang)

  return (
    <>
      {doc.fallback && (
        <div className="mb-4 px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg-elevated)] text-[12px] text-[var(--text-muted)]">
          {t.docs.rev['ru-pending']}
        </div>
      )}
      <article className="docs-content">
        <MDXRemote
          source={doc.content}
          components={mdxComponents}
          options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
        />
      </article>
    </>
  )
}
