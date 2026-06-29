import type { DesignSystem } from "./types"

/**
 * "RantAI — Warm Paper": the house design system. Warm parchment surfaces,
 * editorial serif headlines, the RantAI blue accent, and depth built from
 * 1px rings rather than heavy borders or large shadows. This is the brand
 * voice every generated artifact is steered toward by default.
 */
export const rantaiDesignSystem: DesignSystem = {
  id: "rantai",
  title: "RantAI — Warm Paper",
  summary:
    "Warm parchment surfaces, editorial serif headlines, RantAI-blue accent, ring-based depth.",
  category: "Brand",
  isDefault: true,

  designMd: `# RantAI — Warm Paper

> Warm, editorial, premium. The opposite of default-AI slate-and-indigo.

## 1. Visual theme
Surfaces feel like high-quality paper, not screens: a warm parchment canvas with ivory cards floating on quiet 1px rings. Headlines are set in a serif so every screen reads like a well-made document rather than a generic SaaS dashboard. One cool note cuts through the warmth — the RantAI blue — reserved for the single most important action or number on a view. The result should feel calm, confident, and considered.

## 2. Color roles
- Canvas (--ds-bg #f5f4ed): the warm paper page background. The emotional foundation.
- Surface (--ds-surface #fdfdfb) / Surface-2 (--ds-surface-2 #ffffff): cards and the most-raised elements (inputs, popovers).
- Ink (--ds-ink #18181a): primary text — a warm near-black, never pure #000.
- Muted (--ds-muted #6a6964) / Faint (--ds-faint #8a8980): secondary text and small labels. Every neutral carries a warm (yellow-brown) undertone — never cool blue-gray.
- Accent (--ds-accent #3b6ddb): RantAI blue. Primary buttons, focus rings, the one emphasized metric, the active chart series. Use sparingly — one primary accent moment per view.
- Borders & rings (--ds-border #e9e6dd, --ds-ring #e3e0d6): warm hairlines. Depth comes from rings, not shadow stacks.
- Status: success #2f7d57, warning #b8862b, danger #b5453a — all warm-leaning. Use only for genuine state.

## 3. Typography
- Display / headings: serif (--ds-font-display, Georgia fallback), tracking-tight, generous size jumps. h1 large, h2 ~2/3, h3 ~1/2.
- Body / UI: sans (--ds-font-sans, Inter), relaxed leading for reading text.
- Mono: --ds-font-mono for code, IDs, timestamps. Numbers use tabular-nums.
- Pairing rule: headings serif, everything else sans. Do not set body copy in the serif.

## 4. Spacing & layout
- Section rhythm py-12 → py-16; card padding p-5 → p-6; gaps gap-4 / gap-6.
- Mobile-first; touch targets ≥ 44px (h-11). Flexbox first, grid only for true 2D.
- Generous whitespace beats dense chrome. Let the paper breathe.

## 5. Depth (the signature)
- Resting card: a 1px ring + a whisper shadow (--ds-shadow-card), never a chunky border.
- Recessed/inset areas: an inset 1px ring on the canvas color.
- Only modals/popovers earn a real drop shadow (--ds-shadow-pop).

## 6. Motion
- Subtle and quick: 150–250ms, ease-out. Hover lifts are 1–2px at most. No bouncing, no long fades. Motion confirms an action; it never performs.

## 7. Voice
- Copy is plain, specific, and human. Real product copy, never Lorem ipsum. Labels are short and lowercase-leaning; numbers are concrete.

## 8. Anti-patterns (never do these)
- ❌ Pure white #fff pages or pure black #000 text — always the warm canvas + warm ink.
- ❌ Cool blue-gray neutrals (slate). Every gray must be warm.
- ❌ Indigo/violet as the accent. The accent is the RantAI blue, and only one accent moment per view.
- ❌ Heavy borders or stacked drop shadows for depth — use rings.
- ❌ Body text in the serif; serif is for headlines only.
- ❌ Generic "SaaS dashboard" slate-50 + indigo-600 + Inter-everywhere look.`,

  tokensCss: `:root {
  /* RantAI — Warm Paper. Paste this block verbatim, then build with the vars. */
  --ds-bg: #f5f4ed;          /* page / canvas */
  --ds-surface: #fdfdfb;     /* cards, raised panels */
  --ds-surface-2: #ffffff;   /* most-raised: inputs, popovers */
  --ds-ink: #18181a;         /* primary text (warm near-black) */
  --ds-muted: #6a6964;       /* secondary text */
  --ds-faint: #8a8980;       /* tertiary text, small labels */
  --ds-accent: #3b6ddb;      /* RantAI blue — primary action / emphasis */
  --ds-accent-hover: #2f5ec4;
  --ds-accent-ink: #ffffff;  /* text on accent */
  --ds-accent-soft: rgba(59, 109, 219, 0.10);
  --ds-border: #e9e6dd;      /* warm hairline */
  --ds-border-strong: #e0ddd2;
  --ds-ring: #e3e0d6;        /* depth ring */
  --ds-success: #2f7d57;
  --ds-warning: #b8862b;
  --ds-danger: #b5453a;
  --ds-font-display: Georgia, "Times New Roman", serif;
  --ds-font-sans: "Inter", system-ui, -apple-system, sans-serif;
  --ds-font-mono: "JetBrains Mono", ui-monospace, "SF Mono", monospace;
  --ds-radius-sm: 8px;
  --ds-radius: 10px;
  --ds-radius-lg: 14px;
  --ds-radius-xl: 18px;
  --ds-shadow-ring: 0 0 0 1px var(--ds-ring);
  --ds-shadow-sm: 0 1px 2px rgba(24, 24, 26, 0.05);
  --ds-shadow-card: 0 0 0 1px var(--ds-border), 0 1px 2px rgba(24, 24, 26, 0.04);
  --ds-shadow-pop: 0 8px 30px rgba(24, 24, 26, 0.08);
}
@media (prefers-color-scheme: dark) {
  :root {
    --ds-bg: #1a1917;
    --ds-surface: #211f1d;
    --ds-surface-2: #26241f;
    --ds-ink: #f3f1ea;
    --ds-muted: #a8a59b;
    --ds-faint: #807d73;
    --ds-accent: #5b87e6;
    --ds-accent-hover: #6f97ea;
    --ds-accent-ink: #14130f;
    --ds-accent-soft: rgba(91, 135, 230, 0.15);
    --ds-border: #322f2a;
    --ds-border-strong: #3a372f;
    --ds-ring: #322f2a;
    --ds-success: #57b07f;
    --ds-warning: #d9a441;
    --ds-danger: #d97a6e;
    --ds-shadow-card: 0 0 0 1px #322f2a, 0 1px 2px rgba(0, 0, 0, 0.3);
    --ds-shadow-pop: 0 10px 34px rgba(0, 0, 0, 0.45);
  }
}`,

  tailwindGuide: `Tailwind v3 (CDN) is loaded in the artifact runtime. Apply the tokens with arbitrary-value utilities — do NOT hardcode raw hexes that duplicate a token.

Foundations
- Page/body: bg-[var(--ds-bg)] text-[var(--ds-ink)] antialiased, and set style="font-family:var(--ds-font-sans)" on <body>.
- Headlines (h1–h3): style="font-family:var(--ds-font-display)" + tracking-tight. Headlines are SERIF; body/UI stays sans.
- Secondary text: text-[var(--ds-muted)]. Small labels/captions: text-[var(--ds-faint)] text-xs uppercase tracking-wide.

Surfaces & depth (signature: depth from 1px RINGS, not heavy borders or big shadows)
- Card/panel: bg-[var(--ds-surface)] rounded-[var(--ds-radius-lg)] shadow-[var(--ds-shadow-card)] p-5 md:p-6
- Recessed/inset: bg-[var(--ds-bg)] shadow-[inset_0_0_0_1px_var(--ds-border)]
- Hairline divider: border-[var(--ds-border)]
- Floating (modal/popover): bg-[var(--ds-surface-2)] rounded-[var(--ds-radius-xl)] shadow-[var(--ds-shadow-pop)]

Accent (RantAI blue — sparing, ONE primary moment per view)
- Primary button: bg-[var(--ds-accent)] text-[var(--ds-accent-ink)] hover:bg-[var(--ds-accent-hover)] rounded-[var(--ds-radius)] px-4 h-11 font-medium shadow-[var(--ds-shadow-sm)]
- Secondary button: bg-[var(--ds-surface)] text-[var(--ds-ink)] shadow-[var(--ds-shadow-ring)] hover:bg-[var(--ds-surface-2)]
- Accent pill/badge: bg-[var(--ds-accent-soft)] text-[var(--ds-accent)] rounded-full px-2.5 py-0.5 text-xs font-medium
- Emphasis number / positive delta / active chart series: text-[var(--ds-accent)]
- Focus ring (every interactive element): focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-bg)]

Charts (Recharts): grid stroke var(--ds-border); axes var(--ds-faint); primary series var(--ds-accent); tooltip contentStyle { borderRadius: 10, border: "1px solid var(--ds-border)" }.

Rhythm: section py-12 md:py-16; card p-5/p-6; gaps gap-4/gap-6; touch targets ≥ h-11.`,

  componentManifest: `Mirror these component shapes for consistency across artifacts:
- Stat tile: bg-[var(--ds-surface)] rounded-[var(--ds-radius-lg)] shadow-[var(--ds-shadow-card)] p-4 -> label text-[var(--ds-faint)] text-xs uppercase tracking-wide; value text-2xl font-semibold tracking-tight tabular-nums (serif optional); delta text-[var(--ds-accent)] or var(--ds-success)/var(--ds-danger).
- Card: surface + shadow-card + p-6; serif title; body text-[var(--ds-muted)]; optional hover:shadow-[var(--ds-shadow-pop)] transition.
- Table: wrapper rounded-[var(--ds-radius-lg)] shadow-[var(--ds-shadow-card)] overflow-hidden; thead bg-[var(--ds-bg)] text-[var(--ds-faint)] uppercase text-xs; rows divide-y divide-[var(--ds-border)]; numeric columns text-right tabular-nums.
- Nav/header: bg-[var(--ds-surface)]/80 backdrop-blur, bottom hairline via shadow-[inset_0_-1px_0_var(--ds-border)]; brand in serif.
- Status badge: accent-soft for info; for real states use var(--ds-success)/var(--ds-warning)/var(--ds-danger) at ~10% bg + solid text.
- Input/select: h-11 bg-[var(--ds-surface-2)] rounded-[var(--ds-radius)] shadow-[var(--ds-shadow-ring)] px-3 + accent focus ring.
- Empty state: rounded-[var(--ds-radius-lg)] shadow-[inset_0_0_0_1px_var(--ds-border)] p-10 text-center; icon chip bg-[var(--ds-accent-soft)] text-[var(--ds-accent)] rounded-full grid place-items-center; serif heading; body text-[var(--ds-muted)]; one accent primary action.
- Modal/popover: floating surface (shadow-pop), rounded-xl, one accent primary action.`,
}
