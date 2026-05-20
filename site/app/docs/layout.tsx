import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { getPageMap } from 'nextra/page-map'
import config from '../../theme.config'

export const metadata = {
  title: {
    default: 'RantAI Agents Documentation',
    template: '%s | RantAI Agents Docs',
  },
  description:
    'Documentation for RantAI Agents — Enterprise AI agent platform for building and deploying intelligent assistants.',
}

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pageMap = await getPageMap('/docs')

  return (
    <Layout
      navbar={<Navbar logo={config.logo} projectLink={config.project?.link} />}
      footer={<Footer>{config.footer?.content}</Footer>}
      docsRepositoryBase={config.docsRepositoryBase}
      sidebar={config.sidebar}
      toc={config.toc}
      pageMap={pageMap}
    >
      {children}
    </Layout>
  )
}
