import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const targetDir = join(root, "app", "fonts", "poppins")
const bundledDir = join(root, "assets", "fonts", "poppins")

const files = [
  "Poppins-300.ttf",
  "Poppins-400.ttf",
  "Poppins-500.ttf",
  "Poppins-600.ttf",
  "Poppins-700.ttf",
]

mkdirSync(targetDir, { recursive: true })

let copied = 0
const missingBundle: string[] = []

for (const file of files) {
  const target = join(targetDir, file)
  const bundled = join(bundledDir, file)

  if (existsSync(target)) {
    const st = statSync(target)
    if (st.size > 0) continue
  }

  if (!existsSync(bundled)) {
    missingBundle.push(file)
    continue
  }

  copyFileSync(bundled, target)
  copied++
}

if (missingBundle.length > 0) {
  throw new Error(
    `Missing bundled font files: ${missingBundle.join(", ")}. ` +
      "Run in online mode once to refresh assets/fonts/poppins or restore them from VCS."
  )
}

console.log(
  copied > 0
    ? `[fonts] Prepared ${copied} local font file(s) from assets/fonts/poppins.`
    : "[fonts] Local fonts already present."
)
