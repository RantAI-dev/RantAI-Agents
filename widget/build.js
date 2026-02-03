const esbuild = require("esbuild")
const path = require("path")

const isWatch = process.argv.includes("--watch")

const buildOptions = {
  entryPoints: [path.join(__dirname, "src/index.ts")],
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch,
  target: ["es2020"],
  format: "iife",
  globalName: "RantAIWidget",
  outfile: path.join(__dirname, "../public/widget/rantai-widget.js"),
  define: {
    "process.env.NODE_ENV": isWatch ? '"development"' : '"production"',
  },
}

async function build() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions)
      await ctx.watch()
      console.log("Watching for changes...")
    } else {
      await esbuild.build(buildOptions)
      console.log("Widget built successfully!")
    }
  } catch (error) {
    console.error("Build failed:", error)
    process.exit(1)
  }
}

build()
