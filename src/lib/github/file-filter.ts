/**
 * Smart file filter for GitHub repo imports.
 * Skips build artifacts, binaries, lockfiles, and non-code files.
 */

const BLOCKED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  "out",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  "vendor",
  ".cache",
  "coverage",
  ".idea",
  ".vscode",
  ".turbo",
  ".vercel",
  ".output",
  ".nuxt",
  ".svelte-kit",
  ".parcel-cache",
  "bower_components",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  ".eggs",
  "egg-info",
])

const BLOCKED_EXTENSIONS = new Set([
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".bmp", ".tiff", ".avif",
  // Binaries
  ".wasm", ".exe", ".dll", ".so", ".dylib", ".bin", ".o", ".a", ".lib", ".class", ".pyc", ".pyo",
  // Media
  ".mp4", ".mp3", ".wav", ".ogg", ".webm", ".avi", ".mov", ".flac",
  // Archives
  ".zip", ".tar", ".gz", ".bz2", ".xz", ".rar", ".7z", ".tgz",
  // Fonts
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  // Misc
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".db", ".sqlite", ".sqlite3",
  ".map", ".min.js", ".min.css",
])

const BLOCKED_FILENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
  "Cargo.lock",
  "go.sum",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
  "Pipfile.lock",
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
])

/** Max file size to include (500KB) — larger files are likely generated/minified */
const MAX_FILE_SIZE = 500 * 1024

/**
 * Determine if a file from a GitHub repo tree should be included in the import.
 */
export function shouldIncludeFile(path: string, size: number): boolean {
  if (size > MAX_FILE_SIZE) return false

  const parts = path.split("/")
  const fileName = parts[parts.length - 1]

  // Check blocked filenames
  if (BLOCKED_FILENAMES.has(fileName)) return false

  // Check blocked directories
  for (const part of parts.slice(0, -1)) {
    if (BLOCKED_DIRS.has(part) || part.startsWith(".") && BLOCKED_DIRS.has(part)) return false
  }

  // Check blocked extensions
  const extMatch = fileName.match(/\.[^.]+$/)
  if (extMatch && BLOCKED_EXTENSIONS.has(extMatch[0].toLowerCase())) return false

  // Skip dotfiles (but allow .gitignore, .env.example, .eslintrc, etc.)
  if (fileName.startsWith(".") && !isUsefulDotfile(fileName)) return false

  return true
}

function isUsefulDotfile(name: string): boolean {
  const useful = [
    ".gitignore", ".gitattributes",
    ".env.example", ".env.sample", ".env.template",
    ".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml",
    ".prettierrc", ".prettierrc.js", ".prettierrc.json",
    ".editorconfig",
    ".dockerignore",
    ".npmrc", ".nvmrc", ".node-version",
    ".python-version",
    ".tool-versions",
    ".babelrc",
  ]
  return useful.includes(name) || name.startsWith(".eslint") || name.startsWith(".prettier")
}
