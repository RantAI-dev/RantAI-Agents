/**
 * Identifier extraction for exact code / entity retrieval (TC-994).
 *
 * Extracts alphanumeric identifier tokens containing hyphens and/or underscores
 * (e.g. `ING-P20-6120`, `ING-P40-6140`, `RX-9920-ZETA`, `ERR_CODE_404`).
 * Plain natural language words without hyphens or underscores are omitted.
 */

// Regex for alphanumeric codes containing one or more hyphens or underscores
// with alphanumeric boundaries: e.g. ABC-123, ING-P20-6120, TRX_01
const IDENTIFIER_CODE_RE = /\b[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+\b/g;

export function extractIdentifierTokens(query: string): string[] {
  if (!query || !query.trim()) return [];
  const matches = query.match(IDENTIFIER_CODE_RE) || [];
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const m of matches) {
    const key = m.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tokens.push(m);
    }
  }

  return tokens;
}
