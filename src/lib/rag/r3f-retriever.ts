/**
 * R3F / Drei RAG retriever
 *
 * Retrieves relevant R3F and Drei documentation from the vector store
 * when a user requests a 3D artifact. This context is injected into
 * the system prompt so the AI has specific component knowledge.
 */

import { retrieveContext, formatContextForPrompt } from "./retriever";

/**
 * Retrieve R3F/Drei documentation context for a 3D scene query.
 * Returns a formatted string to inject into the system prompt,
 * or null if no relevant context is found.
 */
export async function retrieveR3FContext(
    query: string,
    options?: {
        maxChunks?: number;
        minSimilarity?: number;
    }
): Promise<string | null> {
    try {
        const result = await retrieveContext(query, {
            categoryFilter: "R3F_3D",
            maxChunks: options?.maxChunks ?? 8,
            minSimilarity: options?.minSimilarity ?? 0.25,
        });

        if (!result.context || result.chunks.length === 0) {
            return null;
        }

        return formatContextForPrompt(result);
    } catch (error) {
        console.error("[R3F RAG] Retrieval error:", error);
        return null;
    }
}
