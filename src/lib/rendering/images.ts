/**
 * Fetch a remote image as a base64 data URL.
 *
 * Used by artifact export pipelines (e.g. PPTX) that need to inline
 * image bytes into the output file. Returns null on any failure so
 * callers can render a placeholder without blowing up the export.
 *
 * Note: `unsplash:<keyword>` pseudo-URLs are resolved to real Unsplash
 * URLs at artifact save time (see `lib/unsplash/resolver.ts`). By the
 * time this helper runs, the URL is already a real `https://...`. We
 * intentionally do not handle `unsplash:` here — the deprecated
 * `source.unsplash.com` redirect stopped working in 2023.
 */
export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null

    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
