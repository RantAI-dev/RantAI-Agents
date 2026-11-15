import React from "react"
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { SessionProvider } from '@/components/providers/session-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { brand, brandIcons } from '@/lib/branding'
import { resolveColor } from '@/lib/design-tokens/resolve'
import type { DesignTokens } from '@/lib/design-tokens/schema'
import tokens from '@/styles/tokens.json'
import './globals.css'

// Geist and Geist Mono (SIL OFL 1.1, see fonts/geist/OFL.txt) are the design system's faces.
const geistSans = localFont({
  src: './fonts/geist/Geist-Variable.woff2',
  weight: '100 900',
  variable: '--font-geist-sans',
  display: 'swap',
})

const geistMono = localFont({
  src: './fonts/geist/GeistMono-Variable.woff2',
  weight: '100 900',
  variable: '--font-geist-mono',
  display: 'swap',
  // Mono is for code and IDs, not first paint: don't preload it on every route.
  preload: false,
})

export const metadata: Metadata = {
  title: brand.metaTitle,
  description: brand.metaDescription,
  generator: 'v0.app',
  keywords: brand.metaKeywords,
  openGraph: {
    title: brand.metaTitle,
    description: 'Build and deploy intelligent AI agents with RAG, multi-channel deployment, and human-in-the-loop workflows.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: brand.metaTitle,
    description: 'Build and deploy intelligent AI agents with RAG, multi-channel deployment, and human-in-the-loop workflows.',
  },
  icons: brandIcons,
  manifest: brand.manifestPath,
}

export const viewport: Viewport = {
  // The app opens in the light theme (ThemeProvider defaultTheme), so the browser chrome does too.
  themeColor: resolveColor(tokens as DesignTokens, 'background', 'light'),
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
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
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
