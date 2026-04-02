'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

interface ScreenshotProps {
  src: string
  alt: string
}

/**
 * Theme-aware screenshot component.
 *
 * Convention:
 * - Light mode: /images/section/name.png
 * - Dark mode:  /images/section/name-dark.png
 *
 * If the dark variant doesn't exist, it falls back to the light version.
 */
export function Screenshot({ src, alt }: ScreenshotProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const darkSrc = src.replace(/\.(png|jpg|jpeg|webp)$/, '-dark.$1')
  const imgSrc = mounted && resolvedTheme === 'dark' ? darkSrc : src

  return (
    <img
      src={imgSrc}
      alt={alt}
      onError={(e) => {
        // Fallback to light version if dark image doesn't exist
        if (imgSrc === darkSrc) {
          (e.target as HTMLImageElement).src = src
        }
      }}
      style={{
        width: '100%',
        borderRadius: '0.5rem',
        border: '1px solid var(--nextra-border-color, #292929)',
      }}
    />
  )
}
