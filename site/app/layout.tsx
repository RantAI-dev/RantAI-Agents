import type { Metadata, Viewport } from 'next'
import { Head } from 'nextra/components'
import './global.css'

export const metadata: Metadata = {
  title: {
    default: 'RantAI Agents',
    template: '%s | RantAI Agents',
  },
  description:
    'RantAI Agents — Enterprise AI agent platform for building and deploying intelligent assistants.',
  icons: {
    icon: [
      { url: '/logo/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/logo/apple-touch-icon.png',
  },
  manifest: '/logo/site.webmanifest',
  applicationName: 'RantAI Agents',
  appleWebApp: {
    capable: true,
    title: 'RantAI Agents',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0F172A' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>{children}</body>
    </html>
  )
}
