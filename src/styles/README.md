# Styles

The app's look comes from one source: **`tokens.json`**, exported from the "RantAI Agents" design
system in Claude Design. Its brand book (usage rules for every token and component) is kept in
the RantAI Cloud repository at `docs/design-system/README.md`.

| File | What it holds | Edit by hand? |
|---|---|---|
| `tokens.json` | Colour (light + dark), type scale, radius, shadow, motion, sizes, z-index | Yes, or re-export from the design system |
| `tokens.css` | CSS variables and Tailwind theme generated from `tokens.json` | **No**: run `bun run tokens` |
| `theme.css` | Font families (Geist via `next/font`) and the base layer | Yes |
| `workspace-ide.css` | Editor, syntax and terminal colours (functional, not brand) | Yes |
| `landing.css` | What the landing page sets differently (`.theme-home`, used with `.theme-light`) | Yes |
| `chat-markdown.css` | Markdown inside chat messages (`.chat-message`) | Yes |
| `utilities.css` | Small shared utilities: thin scrollbar, dot grid, glows, stagger | Yes |

`src/app/globals.css` only imports these, in this order.

## Changing a token

1. Edit `tokens.json` (or replace it with a fresh export).
2. Run `bun run tokens`.
3. Run `bunx vitest run tests/unit/design-tokens.test.ts`. It fails if `tokens.css` is stale or if
   a colour pair drops below the contrast its token promises (WCAG AA in both themes).

## Using tokens in components

- Colours: shadcn slot names, e.g. `bg-card`, `text-muted-foreground`, `bg-primary-subtle`,
  `text-link`, `border-input`, `bg-plan`. Never a hex value or a Tailwind palette colour.
- Type: `text-prose` (chat, documents), `text-body`, `text-body-sm`, `text-caption`, `text-label`,
  `text-overline` (add `uppercase`), headings `text-display` and `text-title-1` to `text-title-4`.
  Mono styles set size, line height and weight but not the family: pair `text-code` /
  `text-mono-sm` with `font-mono`.
- Forced light: `theme-light` on a wrapper keeps that subtree light in a dark app (landing, sign-in).
- Shape and depth: `rounded-xs` to `rounded-2xl` (derived from `--radius`), `shadow-xs` to
  `shadow-lg` (theme-aware; colour modifiers such as `shadow-primary/10` still apply).
- Layout sizes: `w-sidebar`, `h-header`, `max-w-thread`, `size-control`, `min-h-touch`.
- Motion: `ease-standard` / `ease-enter` / `ease-exit`; durations as
  `duration-(--duration-fast)`; z-index as `z-(--z-modal)`.

## Rebranding (Enterprise)

Change `primary` (and its `primary-hover`, `primary-subtle`, `primary-subtle-foreground`, `ring`,
`link`) and the logo. The contrast test tells you if the new colour fails in either theme.
