/**
 * File processor module for handling different file types
 * Supports: Markdown (.md), PDF (.pdf), Images (.png, .jpg, .jpeg, .gif, .webp)
 */

import * as fs from "fs";
import * as path from "path";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const VISION_MODEL = "openai/gpt-4o-mini"; // Cost-effective vision model

export type SupportedFileType = "markdown" | "pdf" | "image";

export interface ProcessedFile {
  content: string;
  fileType: SupportedFileType;
  originalPath: string;
}

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"];
const MARKDOWN_EXTENSIONS = [".md", ".markdown"];
const PDF_EXTENSIONS = [".pdf"];

/**
 * Detect file type based on extension
 */
export function detectFileType(filePath: string): SupportedFileType | null {
  const ext = path.extname(filePath).toLowerCase();

  if (MARKDOWN_EXTENSIONS.includes(ext)) return "markdown";
  if (PDF_EXTENSIONS.includes(ext)) return "pdf";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";

  return null;
}

/**
 * Check if a file is supported
 */
export function isSupportedFile(filePath: string): boolean {
  return detectFileType(filePath) !== null;
}

/**
 * Get all supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return [...MARKDOWN_EXTENSIONS, ...PDF_EXTENSIONS, ...IMAGE_EXTENSIONS];
}

/**
 * Process a markdown file
 */
async function processMarkdown(filePath: string): Promise<string> {
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Process a PDF file and extract text
 * Uses pdfjs-dist legacy build to avoid worker issues in Next.js
 */
async function processPdf(filePath: string): Promise<string> {
  try {
    // Use unpdf for serverless-compatible text extraction
    const { extractText, getDocumentProxy } = await import("unpdf");
    const dataBuffer = fs.readFileSync(filePath);
    const pdf = await getDocumentProxy(new Uint8Array(dataBuffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch (error) {
    console.error("PDF processing error:", error);
    throw new Error(`Failed to process PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Process an image using vision model to extract description and text
 */
async function processImage(filePath: string): Promise<string> {
  const imageBuffer = fs.readFileSync(filePath);
  const base64Image = imageBuffer.toString("base64");
  const ext = path.extname(filePath).toLowerCase();

  // Determine MIME type
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".heic": "image/heic",
  };
  const mimeType = mimeTypes[ext] || "image/png";

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this image and provide:
1. A detailed description of what the image shows
2. Any text visible in the image (OCR)
3. Key information or data points visible

Format your response as structured text that can be used for search and retrieval. Be thorough but concise.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Vision API error: ${response.status} - ${errorText}`
    );
  }

  const data = await response.json();
  const description = data.choices[0]?.message?.content || "";

  // Add metadata header for better context
  const fileName = path.basename(filePath);
  return `[Image: ${fileName}]\n\n${description}`;
}

/**
 * Process a file based on its type
 */
export async function processFile(filePath: string): Promise<ProcessedFile> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileType = detectFileType(filePath);
  if (!fileType) {
    throw new Error(`Unsupported file type: ${filePath}`);
  }

  let content: string;

  switch (fileType) {
    case "markdown":
      content = await processMarkdown(filePath);
      break;
    case "pdf":
      content = await processPdf(filePath);
      break;
    case "image":
      content = await processImage(filePath);
      break;
  }

  return {
    content,
    fileType,
    originalPath: filePath,
  };
}

/**
 * Process multiple files
 */
export async function processFiles(
  filePaths: string[]
): Promise<ProcessedFile[]> {
  const results: ProcessedFile[] = [];

  for (const filePath of filePaths) {
    try {
      const processed = await processFile(filePath);
      results.push(processed);
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error);
    }
  }

  return results;
}

/**
 * Scan a directory for supported files
 */
export function scanDirectory(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Recursively scan subdirectories
      files.push(...scanDirectory(fullPath));
    } else if (entry.isFile() && isSupportedFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}
