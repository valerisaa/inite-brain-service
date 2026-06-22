import { Header } from '../../components/Header'
import { Hero } from '../../components/Hero'
import { BitemporalDemo } from '../../components/BitemporalDemo'
import { RetrievalPipeline } from '../../components/RetrievalPipeline'
import { BeyondVector } from '../../components/BeyondVector'
import { Features } from '../../components/Features'
import { DualPath } from '../../components/DualPath'
import { Stats } from '../../components/Stats'
import { QuickstartTabs } from '../../components/QuickstartTabs'
import { McpInstall } from '../../components/McpInstall'
import { SkillsInstall } from '../../components/SkillsInstall'
import { OpenSource } from '../../components/OpenSource'
import { Footer } from '../../components/Footer'
import { normalizeLang } from '../../lib/i18n'

interface Props {
  params: Promise<{ lang: string }>
}

export default async function LandingPage({ params }: Props) {
  const { lang: raw } = await params
  const lang = normalizeLang(raw)
  return (
    <div className="lab-root min-h-screen">
      <Header lang={lang} />
      <main className="max-w-6xl mx-auto px-5 sm:px-6">
        <Hero lang={lang} />
        <BitemporalDemo lang={lang} />
        <RetrievalPipeline lang={lang} />
        <BeyondVector lang={lang} />
        <Features lang={lang} />
        <DualPath lang={lang} />
        <Stats lang={lang} />
        <QuickstartTabs lang={lang} />
        <McpInstall lang={lang} />
        <SkillsInstall lang={lang} />
        <OpenSource lang={lang} />
        <Footer lang={lang} />
      </main>
    </div>
  )
}
