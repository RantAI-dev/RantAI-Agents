"use client"

import { useState, useMemo, useCallback } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table"
import { ArrowUpDown, Download, Search, AlertTriangle } from "lucide-react"

interface SheetRendererProps {
  content: string
}

type RowData = Record<string, string>

export function SheetRenderer({ content }: SheetRendererProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")

  const { headers, rows, parseError } = useMemo(() => {
    try {
      // Try JSON array first
      if (content.trimStart().startsWith("[")) {
        const data = JSON.parse(content)
        if (Array.isArray(data) && data.length > 0) {
          const headers = Object.keys(data[0])
          const rows: RowData[] = data.map((item: Record<string, unknown>) => {
            const row: RowData = {}
            headers.forEach((h) => {
              row[h] = String(item[h] ?? "")
            })
            return row
          })
          return { headers, rows, parseError: null }
        }
      }
      // Fall back to CSV parsing
      const lines = parseCSV(content)
      if (lines.length < 2)
        return { headers: [], rows: [], parseError: "No data rows found" }
      const headers = lines[0]
      const rows: RowData[] = lines.slice(1).map((row) => {
        const obj: RowData = {}
        headers.forEach((h, i) => {
          obj[h] = row[i] || ""
        })
        return obj
      })
      return { headers, rows, parseError: null }
    } catch (err) {
      return {
        headers: [] as string[],
        rows: [] as RowData[],
        parseError:
          err instanceof Error ? err.message : "Failed to parse data",
      }
    }
  }, [content])

  const columns = useMemo<ColumnDef<RowData>[]>(
    () =>
      headers.map((h) => ({
        accessorKey: h,
        header: h,
      })),
    [headers]
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const handleExportCSV = useCallback(() => {
    const escape = (v: string) =>
      v.includes(",") || v.includes('"') || v.includes("\n")
        ? `"${v.replace(/"/g, '""')}"`
        : v
    const csvRows = [headers.map(escape).join(",")]
    table.getRowModel().rows.forEach((row) => {
      csvRows.push(
        headers
          .map((h) => escape(row.original[h] || ""))
          .join(",")
      )
    })
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "export.csv"
    a.click()
    URL.revokeObjectURL(url)
  }, [headers, table])

  if (parseError) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 text-amber-500">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">
              Could not parse table data
            </span>
          </div>
          <div className="px-3 py-2 border-t border-amber-500/20 text-xs text-amber-500/80">
            {parseError}
          </div>
          <pre className="px-3 py-3 border-t border-amber-500/20 text-xs text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap font-mono bg-muted/30">
            {content}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Filter..."
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={handleExportCSV}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {table.getRowModel().rows.length} rows
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none border-b whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border/50 hover:bg-muted/30"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-3 py-1.5 text-sm whitespace-nowrap"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Simple RFC 4180 CSV parser handling quoted fields */
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ",") {
        current.push(field.trim())
        field = ""
      } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        current.push(field.trim())
        field = ""
        if (current.some(Boolean)) rows.push(current)
        current = []
        if (ch === "\r") i++
      } else {
        field += ch
      }
    }
  }
  if (field || current.length) {
    current.push(field.trim())
    if (current.some(Boolean)) rows.push(current)
  }
  return rows
}
