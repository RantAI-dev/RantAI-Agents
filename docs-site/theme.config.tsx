import type { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <strong>RantAI Agents</strong>,
  project: {
    link: 'https://github.com/RantAI-dev/RantAI-Agents',
  },
  docsRepositoryBase: 'https://github.com/RantAI-dev/RantAI-Agents/tree/main/docs-site',
  footer: {
    content: `© ${new Date().getFullYear()} RantAI. All rights reserved.`,
  },
  sidebar: {
    defaultMenuCollapseLevel: 1,
  },
  toc: {
    backToTop: true,
  },
}

export default config
