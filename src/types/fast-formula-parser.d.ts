declare module "fast-formula-parser" {
  class FormulaParser {
    static DepParser: typeof DepParser
    static FormulaError: typeof FormulaError

    constructor(config?: {
      functions?: Record<string, (...args: unknown[]) => unknown>
      functionsNeedContext?: Record<string, (...args: unknown[]) => unknown>
      onVariable?: (name: string, sheetName: string) => unknown
      onCell?: (ref: { sheet: string; row: number; col: number }) => unknown
      onRange?: (ref: {
        sheet?: string
        from: { row: number; col: number }
        to: { row: number; col: number }
      }) => unknown
    })

    parse(
      inputText: string,
      position: { row: number; col: number; sheet: string },
      allowReturnArray?: boolean
    ): unknown
  }

  class DepParser {
    constructor(config?: { onVariable?: (name: string, sheetName: string) => unknown })

    parse(
      inputText: string,
      position: { row: number; col: number; sheet: string },
      ignoreError?: boolean
    ): Array<{
      sheet?: string
      row?: number
      col?: number
      from?: { row: number; col: number }
      to?: { row: number; col: number }
    }>
  }

  class FormulaError extends Error {
    readonly error: string
    static REF: FormulaError
    static NAME: FormulaError
    static VALUE: FormulaError
    static DIV0: FormulaError
    static NA: FormulaError
    static NUM: FormulaError
    static ERROR(msg: string, details?: unknown): FormulaError
  }

  export default FormulaParser
  export { DepParser, FormulaError }
}
