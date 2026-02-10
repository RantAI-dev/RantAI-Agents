import React from "react"
import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SessionProvider } from '@/components/providers/session-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { brand } from '@/lib/branding'
import './globals.css'

const poppins = Poppins({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

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
  icons: {
    icon: [
      { url: brand.favicon16, sizes: '16x16', type: 'image/png' },
      { url: brand.favicon32, sizes: '32x32', type: 'image/png' },
    ],
    apple: brand.appleTouchIcon,
  },
  manifest: brand.manifestPath,
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
      <body className={`${poppins.className} antialiased bg-background text-foreground`}>
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
