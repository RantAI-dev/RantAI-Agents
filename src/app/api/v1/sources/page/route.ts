import { resolveSourcePage } from "@/features/agent-api/source-links"

/**
 * GET /api/v1/sources/page?t=<signed token> — the book page behind a chat
 * reference (UAT issue 7). Thin by design; all logic lives in
 * src/features/agent-api/source-links.ts.
 *
 * Deliberately NOT authenticated by an API key: the token IS the authority.
 * Tokens are minted only from sources an authenticated assistant actually
 * retrieved, carry the document id and page inside their signed payload,
 * and expire. This route reads nothing from the request except `t` — in
 * particular a `documentId` in the query string is never accepted, so
 * there is no way to ask for a document that retrieval did not surface.
 * See source-links.ts (tenancy note) for the full contract.
 */
export async function GET(req: Request) {
  return resolveSourcePage(new URL(req.url).searchParams.get("t"))
}
