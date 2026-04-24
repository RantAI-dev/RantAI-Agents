import { describe, it, expect, expectTypeOf } from "vitest"
import { ChartDataSchema } from "@/lib/slides/types.zod"
import type { ChartData } from "@/lib/slides/types"

describe("ChartDataSchema", () => {
  it("accepts a valid bar chart", () => {
    const data = {
      type: "bar" as const,
      title: "Revenue",
      data: [
        { label: "Jan", value: 100 },
        { label: "Feb", value: 120 },
      ],
    }
    expect(ChartDataSchema.safeParse(data).success).toBe(true)
  })

  it("accepts a line chart with multiple series", () => {
    const data = {
      type: "line" as const,
      labels: ["Q1", "Q2", "Q3", "Q4"],
      series: [
        { name: "A", values: [1, 2, 3, 4] },
        { name: "B", values: [4, 3, 2, 1] },
      ],
    }
    expect(ChartDataSchema.safeParse(data).success).toBe(true)
  })

  it("rejects unknown chart type", () => {
    const bad = { type: "radar", data: [] }
    expect(ChartDataSchema.safeParse(bad).success).toBe(false)
  })

  it("rejects dataPoint missing label", () => {
    const bad = { type: "bar", data: [{ value: 5 }] }
    expect(ChartDataSchema.safeParse(bad).success).toBe(false)
  })

  it("type-level: z.infer is assignable to TS ChartData", () => {
    expectTypeOf<ReturnType<typeof ChartDataSchema.parse>>().toMatchTypeOf<ChartData>()
  })
})
