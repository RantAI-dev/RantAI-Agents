/**
 * Script to ingest R3F and Drei documentation into the vector store
 * for the 3D artifact RAG pipeline.
 *
 * Usage:
 *   bun scripts/ingest-r3f-docs.ts
 *
 * This ingests the curated R3F + Drei reference docs from knowledge-base/
 * into the vector store with category "R3F_3D" so they can be retrieved
 * when users create application/3d artifacts.
 */

import * as dotenv from "dotenv";
dotenv.config();

import * as path from "path";
import { ingestFile } from "../lib/rag/ingest";

const R3F_DOCS = [
    {
        filename: "r3f-reference.md",
        title: "React Three Fiber (R3F) Core Reference",
        category: "R3F_3D",
        subcategory: "Core",
    },
    {
        filename: "drei-components.md",
        title: "@react-three/drei Component Reference",
        category: "R3F_3D",
        subcategory: "Drei",
    },
    {
        filename: "3d-model-library.md",
        title: "Free 3D Model Library — GLB/GLTF URLs for useGLTF",
        category: "R3F_3D",
        subcategory: "Models",
    },
];

async function main() {
    console.log("=".repeat(60));
    console.log("R3F / Drei Knowledge Base Ingestion");
    console.log("=".repeat(60));

    if (!process.env.OPENROUTER_API_KEY) {
        console.error("Error: OPENROUTER_API_KEY environment variable is not set");
        process.exit(1);
    }

    if (!process.env.DATABASE_URL) {
        console.error("Error: DATABASE_URL environment variable is not set");
        process.exit(1);
    }

    const knowledgeBasePath = path.join(process.cwd(), "knowledge-base");
    let totalChunks = 0;

    for (const doc of R3F_DOCS) {
        const filePath = path.join(knowledgeBasePath, doc.filename);
        console.log(`\nIngesting: ${doc.filename}`);

        try {
            const result = await ingestFile(
                filePath,
                doc.title,
                doc.category,
                doc.subcategory
            );
            totalChunks += result.chunks;
            console.log(`  ✓ ${result.chunks} chunks created`);
        } catch (err) {
            console.error(`  ✗ Failed to ingest ${doc.filename}:`, err);
        }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`R3F docs ingestion complete! Total chunks: ${totalChunks}`);
    console.log("=".repeat(60));
}

main().then(() => process.exit(0));
