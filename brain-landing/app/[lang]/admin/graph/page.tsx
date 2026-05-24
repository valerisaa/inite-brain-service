import { redirect } from 'next/navigation'
import { normalizeLang } from '../../../../lib/i18n'

interface Props {
  params: Promise<{ lang: string }>
}

export default async function LegacyGraphRedirect({ params }: Props) {
  const { lang: raw } = await params
  redirect(`/${normalizeLang(raw)}/admin/explore/graph`)
}
