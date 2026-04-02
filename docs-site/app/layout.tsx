import type { Metadata } from 'next'
import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import './global.css'
import config from '../theme.config'

export const metadata: Metadata = {
  title: {
    default: 'RantAI Agents Documentation',
    template: '%s | RantAI Agents Docs',
  },
  description:
    'Documentation for RantAI Agents — Enterprise AI agent platform for building and deploying intelligent assistants.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pageMap = await getPageMap('/docs')

  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
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
      </body>
    </html>
  )
}
