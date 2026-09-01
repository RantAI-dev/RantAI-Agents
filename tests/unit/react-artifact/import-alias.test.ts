import { describe, expect, it } from "vitest"
import { toDestructuringList } from "@/features/conversations/components/chat/artifacts/renderers/react-renderer"

/**
 * Artifact code is authored as ES modules and rewritten into destructuring of
 * iframe globals. `as` is import grammar only, so an aliased import used to
 * emit `const { Menu as MenuIcon } = LucideReact` — a syntax error that killed
 * the whole artifact ("Unexpected token, expected ,").
 */
describe("toDestructuringList", () => {
  it("rewrites an aliased name to destructuring syntax", () => {
    expect(toDestructuringList("Menu as MenuIcon")).toBe("Menu: MenuIcon")
  })

  it("leaves plain names untouched", () => {
    expect(toDestructuringList("Pizza, X, Phone")).toBe("Pizza, X, Phone")
  })

  it("handles the real-world mix of plain and aliased names", () => {
    expect(
      toDestructuringList("Pizza, Menu as MenuIcon, X, Star as StarIcon, Flame")
    ).toBe("Pizza, Menu: MenuIcon, X, Star: StarIcon, Flame")
  })

  it("tolerates trailing commas and ragged whitespace from multi-line imports", () => {
    expect(toDestructuringList("  Truck ,  ChefHat as Chef ,  ")).toBe("Truck, ChefHat: Chef")
  })

  it("produces a clause the JS parser accepts", () => {
    const clause = toDestructuringList("Pizza, Menu as MenuIcon")
    const globals = { Pizza: "pizza", Menu: "menu" }
    const read = new Function("LucideReact", `const {${clause}} = LucideReact; return [Pizza, MenuIcon]`)
    expect(read(globals)).toEqual(["pizza", "menu"])
  })
})
