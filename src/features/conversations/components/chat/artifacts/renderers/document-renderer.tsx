"use client"

import { FileText } from "@/lib/icons"

interface DocumentRendererProps {
  content: string
}

/**
 * Placeholder while the text/document rendering pipeline is being rebuilt.
 * The new pipeline lets the assistant author the document construction code
 * directly (using the docx library in a sandboxed runtime), giving it full
 * control over typography, layout, and native editable math equations.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function DocumentRenderer({ content }: DocumentRendererProps) {
  return (
    <div className="w-full h-full overflow-y-auto bg-muted/30 py-10">
      <div className="mx-auto max-w-[816px] p-8 rounded-md border border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <FileText className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium mb-2 text-amber-900 dark:text-amber-100">
              Document preview is being rebuilt
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The document rendering pipeline is being upgraded to give the
              assistant full creative control over document structure
              (typography, layout, native editable math equations) by letting it
              author the construction code directly using the{" "}
              <code className="px-1 py-0.5 bg-muted rounded">docx</code> library
              in a sandboxed runtime.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              Existing content is preserved in storage. Re-create this artifact
              via the assistant once the new pipeline ships to render it.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
