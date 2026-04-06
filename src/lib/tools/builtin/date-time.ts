import { z } from "zod"
import {
  format,
  parseISO,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  differenceInWeeks,
  differenceInMonths,
  differenceInYears,
  addMinutes,
  addHours,
  addDays,
  addWeeks,
  addMonths,
  addYears,
} from "date-fns"
import type { ToolDefinition } from "../types"

const diffFns: Record<string, (a: Date, b: Date) => number> = {
  minutes: differenceInMinutes,
  hours: differenceInHours,
  days: differenceInDays,
  weeks: differenceInWeeks,
  months: differenceInMonths,
  years: differenceInYears,
}

const addFns: Record<string, (date: Date, amount: number) => Date> = {
  minutes: addMinutes,
  hours: addHours,
  days: addDays,
  weeks: addWeeks,
  months: addMonths,
  years: addYears,
}

export const dateTimeTool: ToolDefinition = {
  name: "date_time",
  displayName: "Date & Time",
  description:
    "Get current date/time, format dates, calculate differences between dates, or add/subtract time. Useful for scheduling, time calculations, and date formatting.",
  category: "builtin",
  parameters: z.object({
    operation: z
      .enum(["now", "format", "diff", "add"])
      .describe(
        "Operation: 'now' = current time, 'format' = format a date, 'diff' = difference between two dates, 'add' = add time to a date"
      ),
    date: z
      .string()
      .optional()
      .describe("ISO 8601 date string (e.g. '2024-03-15T10:30:00Z')"),
    format: z
      .string()
      .optional()
      .describe(
        "date-fns format string (e.g. 'yyyy-MM-dd', 'PPpp'). Default: ISO 8601"
      ),
    amount: z
      .number()
      .optional()
      .describe("Amount of time to add (can be negative to subtract)"),
    unit: z
      .enum(["minutes", "hours", "days", "weeks", "months", "years"])
      .optional()
      .describe("Time unit for diff/add operations"),
    date2: z
      .string()
      .optional()
      .describe("Second ISO 8601 date for 'diff' operation"),
  }),
  execute: async (params) => {
    const operation = params.operation as string

    try {
      switch (operation) {
        case "now": {
          const now = new Date()
          const fmt = (params.format as string) || "yyyy-MM-dd'T'HH:mm:ssXXX"
          return {
            success: true,
            result: format(now, fmt),
            timestamp: now.getTime(),
            iso: now.toISOString(),
          }
        }

        case "format": {
          if (!params.date) {
            return { success: false, error: "'date' parameter is required for format operation" }
          }
          const date = parseISO(params.date as string)
          const fmt = (params.format as string) || "PPpp"
          return {
            success: true,
            result: format(date, fmt),
            timestamp: date.getTime(),
          }
        }

        case "diff": {
          if (!params.date || !params.date2) {
            return {
              success: false,
              error: "'date' and 'date2' are required for diff operation",
            }
          }
          const unit = (params.unit as string) || "days"
          const d1 = parseISO(params.date as string)
          const d2 = parseISO(params.date2 as string)
          const fn = diffFns[unit]
          if (!fn) {
            return { success: false, error: `Unknown unit: ${unit}` }
          }
          const difference = fn(d2, d1)
          return {
            success: true,
            result: `${difference} ${unit}`,
            difference,
            unit,
          }
        }

        case "add": {
          if (!params.date) {
            return { success: false, error: "'date' parameter is required for add operation" }
          }
          if (params.amount == null) {
            return { success: false, error: "'amount' parameter is required for add operation" }
          }
          const unit = (params.unit as string) || "days"
          const date = parseISO(params.date as string)
          const fn = addFns[unit]
          if (!fn) {
            return { success: false, error: `Unknown unit: ${unit}` }
          }
          const result = fn(date, params.amount as number)
          const fmt = (params.format as string) || "yyyy-MM-dd'T'HH:mm:ssXXX"
          return {
            success: true,
            result: format(result, fmt),
            timestamp: result.getTime(),
            iso: result.toISOString(),
          }
        }

        default:
          return { success: false, error: `Unknown operation: ${operation}` }
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Date operation failed",
      }
    }
  },
}
