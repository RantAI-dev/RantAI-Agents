import type { Metadata } from 'next'
import { Head } from 'nextra/components'
import './global.css'

export const metadata: Metadata = {
  title: {
    default: 'RantAI Agents',
    template: '%s | RantAI Agents',
  },
  description:
    'RantAI Agents — Enterprise AI agent platform for building and deploying intelligent assistants.',
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
