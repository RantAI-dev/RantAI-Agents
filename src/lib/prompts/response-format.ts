const FORMAT_INSTRUCTIONS: Record<string, string> = {
  default: "",
  json: "\n\nRESPONSE FORMAT: Always respond with valid JSON. Structure your responses as JSON objects with appropriate keys. Do not include any text outside the JSON.",
  markdown:
    "\n\nRESPONSE FORMAT: Always format your responses using Markdown. Use headers, lists, bold, code blocks, and tables where appropriate for readability.",
  concise:
    "\n\nRESPONSE FORMAT: Be extremely concise. Give the shortest accurate answer possible. Avoid unnecessary elaboration, filler words, or pleasantries. Use bullet points when listing multiple items.",
  detailed:
    "\n\nRESPONSE FORMAT: Provide thorough, detailed responses. Include explanations, examples, and context. Structure your responses with headers and sections for clarity.",
}

export function getResponseFormatInstruction(format?: string): string {
  if (!format || format === "default") return ""
  return FORMAT_INSTRUCTIONS[format] || ""
}
