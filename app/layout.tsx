import React from "react"
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SessionProvider } from '@/components/providers/session-provider'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'RantAI Agents | Enterprise AI Agent Platform',
  description: 'Build and deploy intelligent AI agents with RAG, multi-channel deployment, and human-in-the-loop workflows. Customer support, knowledge assistants, and domain-specific AI.',
  generator: 'v0.app',
  keywords: ['AI agents', 'RAG', 'customer support', 'knowledge base', 'RantAI', 'enterprise', 'chatbot'],
  openGraph: {
    title: 'RantAI Agents | Enterprise AI Agent Platform',
    description: 'Build and deploy intelligent AI agents with RAG, multi-channel deployment, and human-in-the-loop workflows.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RantAI Agents | Enterprise AI Agent Platform',
    description: 'Build and deploy intelligent AI agents with RAG, multi-channel deployment, and human-in-the-loop workflows.',
  },
  icons: {
    icon: [
      { url: '/logo/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/logo/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/logo/apple-touch-icon.png',
  },
  manifest: '/logo/site.webmanifest',
}

export const viewport: Viewport = {
  themeColor: '#F9F8F6',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased bg-background text-foreground`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <SessionProvider>
            {children}
          </SessionProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
