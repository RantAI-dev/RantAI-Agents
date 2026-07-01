/**
 * Critique wire-protocol parser + scoreboard — faithful port of the daemon's
 * critique parser and scorer.
 *
 * Upstream this lives across three daemon-only files:
 *   - reference/open-design/apps/daemon/src/critique/errors.ts
 *   - reference/open-design/apps/daemon/src/critique/parsers/v1.ts
 *   - reference/open-design/apps/daemon/src/critique/scoreboard.ts
 *
 * The cloud port keeps the byte-for-byte wire grammar (`<CRITIQUE_RUN>`,
 * `<ROUND>`, `<PANELIST>`, `<ROUND_END>`, `<SHIP>`, `<ARTIFACT>`) and the
 * composite / convergence math so the SPA's reducer (which is driven by the
 * shared `PanelEvent` contract) renders identically. The model text that the
 * daemon read from a spawned CLI's stdout now comes from our gateway
 * (`streamText` / `generateText`); everything downstream of the character
 * stream is unchanged.
 */
import type {
  CritiqueConfig,
  PanelEvent,
  PanelistRole,
  RoundDecision,
} from "@open-design/contracts/critique";

// ---------------------------------------------------------------------------
// Typed parser failures (port of critique/errors.ts). Each maps to a
// DegradedReason so the orchestrator can tag the terminal `critique.degraded`
// event.
// ---------------------------------------------------------------------------

export class MalformedBlockError extends Error {
  constructor(message: string, public readonly position: number) {
    super(message);
    this.name = "MalformedBlockError";
  }
}

export class OversizeBlockError extends Error {
  constructor(message: string, public readonly position: number) {
    super(message);
    this.name = "OversizeBlockError";
  }
}

export class MissingArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingArtifactError";
  }
}

// ---------------------------------------------------------------------------
// Streaming parser (port of critique/parsers/v1.ts + parser.ts).
// ---------------------------------------------------------------------------

/**
 * Side-channel payload handed to the orchestrator when a SHIP block carries an
 * `<ARTIFACT>`. The body intentionally does NOT ride on the SHIP `PanelEvent`
 * (which is also the SSE wire shape) so artifact bytes never broadcast.
 */
export interface ShipArtifactPayload {
  round: number;
  mime: string;
  body: string;
}

export type ShipArtifactCallback = (payload: ShipArtifactPayload) => void;

export interface ParserOptions {
  runId: string;
  adapter: string;
  parserMaxBlockBytes: number;
  projectId?: string;
  artifactId?: string;
  onArtifact?: ShipArtifactCallback;
}

const KNOWN_ROLES: ReadonlySet<string> = new Set([
  "designer",
  "critic",
  "brand",
  "a11y",
  "copy",
]);

const DIM_RE = /<DIM\s+name="([^"]+)"\s+score="([^"]+)">([\s\S]*?)<\/DIM>/g;
const MUST_FIX_RE = /<MUST_FIX>([\s\S]*?)<\/MUST_FIX>/g;

const DEFAULT_SCORE_SCALE = 10;

interface State {
  buf: string;
  consumed: number;
  runId: string;
  adapter: string;
  protocolVersion: number;
  scoreScale: number;
  parserMaxBlockBytes: number;
  projectId: string;
  artifactId: string;
  inRun: boolean;
  currentRound: number | null;
  roundsClosed: number;
  shipSeen: boolean;
  designerArtifactInRound1: boolean;
  lastAdvance: number;
  onArtifact: ShipArtifactCallback | undefined;
}

export async function* parseCritiqueStream(
  source: AsyncIterable<string>,
  opts: ParserOptions,
): AsyncIterable<PanelEvent> {
  const state: State = {
    buf: "",
    consumed: 0,
    runId: opts.runId,
    adapter: opts.adapter,
    protocolVersion: 1,
    scoreScale: DEFAULT_SCORE_SCALE,
    parserMaxBlockBytes: opts.parserMaxBlockBytes,
    projectId: opts.projectId ?? "",
    artifactId: opts.artifactId ?? "",
    inRun: false,
    currentRound: null,
    roundsClosed: 0,
    shipSeen: false,
    designerArtifactInRound1: false,
    lastAdvance: 0,
    onArtifact: opts.onArtifact,
  };

  for await (const chunk of source) {
    state.buf += chunk;
    yield* drain(state);
    const bufBytes = Buffer.byteLength(state.buf, "utf8");
    if (bufBytes > opts.parserMaxBlockBytes) {
      throw new OversizeBlockError(
        `block exceeded ${opts.parserMaxBlockBytes} bytes at position ${state.consumed}`,
        state.consumed,
      );
    }
  }

  yield* drain(state);

  if (state.inRun && !state.shipSeen) {
    throw new MalformedBlockError(
      `CRITIQUE_RUN never closed (no </CRITIQUE_RUN> and no <SHIP>) at position ${state.consumed}`,
      state.consumed,
    );
  }
}

function* drain(state: State): Generator<PanelEvent> {
  let cursor = 0;

  while (cursor < state.buf.length) {
    const slice = state.buf.slice(cursor);

    if (slice.startsWith("<CRITIQUE_RUN ")) {
      const close = slice.indexOf(">");
      if (close < 0) break;
      const attrs = parseAttrs(slice.slice("<CRITIQUE_RUN".length, close));
      state.protocolVersion = Number(attrs["version"] ?? "1");
      const declaredScale = Number(attrs["scale"] ?? String(DEFAULT_SCORE_SCALE));
      state.scoreScale =
        isFinite(declaredScale) && declaredScale > 0
          ? declaredScale
          : DEFAULT_SCORE_SCALE;
      state.inRun = true;
      yield {
        type: "run_started",
        runId: state.runId,
        protocolVersion: state.protocolVersion,
        cast: ["designer", "critic", "brand", "a11y", "copy"],
        maxRounds: Number(attrs["maxRounds"] ?? "3"),
        threshold: Number(attrs["threshold"] ?? "8.0"),
        scale: state.scoreScale,
      };
      cursor += close + 1;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    const roundMatch = slice.match(/^<ROUND\s+([^>]*)>/);
    if (roundMatch) {
      if (!state.inRun) {
        throw new MalformedBlockError(
          `<ROUND> at position ${state.consumed + cursor} appeared before <CRITIQUE_RUN>`,
          state.consumed + cursor,
        );
      }
      const a = parseAttrs(roundMatch[1] ?? "");
      state.currentRound = Number(a["n"]);
      cursor += roundMatch[0].length;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    if (
      slice.startsWith("<PANELIST ") ||
      slice.startsWith("<PANELIST\t") ||
      slice.startsWith("<PANELIST\n")
    ) {
      if (!state.inRun) {
        throw new MalformedBlockError(
          `<PANELIST> at position ${state.consumed + cursor} appeared before <CRITIQUE_RUN>`,
          state.consumed + cursor,
        );
      }
      const closeIdx = slice.indexOf("</PANELIST>");
      if (closeIdx < 0) break;
      const blockText = slice.slice(0, closeIdx + "</PANELIST>".length);
      const blockBytes = Buffer.byteLength(blockText, "utf8");
      if (blockBytes > state.parserMaxBlockBytes) {
        throw new OversizeBlockError(
          `PANELIST block of ${blockBytes} bytes exceeded ${state.parserMaxBlockBytes} at position ${state.consumed + cursor}`,
          state.consumed + cursor,
        );
      }
      const headEnd = slice.indexOf(">");
      if (headEnd < 0) break;
      if (headEnd >= closeIdx) {
        throw new MalformedBlockError(
          `<PANELIST> opening tag at position ${state.consumed + cursor} has no closing > before </PANELIST>`,
          state.consumed + cursor,
        );
      }
      const head = slice.slice("<PANELIST".length, headEnd);
      const body = slice.slice(headEnd + 1, closeIdx);
      if (/<PANELIST[\s>]/.test(body)) {
        throw new MalformedBlockError(
          `PANELIST block at position ${state.consumed + cursor} never closed before the next <PANELIST opening`,
          state.consumed + cursor,
        );
      }
      const attrs = parseAttrs(head);
      const roleStr = attrs["role"];

      if (!roleStr || !KNOWN_ROLES.has(roleStr)) {
        yield {
          type: "parser_warning",
          runId: state.runId,
          kind: "unknown_role",
          position: state.consumed + cursor,
        };
        cursor += closeIdx + "</PANELIST>".length;
        state.lastAdvance = state.consumed + cursor;
        continue;
      }

      const role = roleStr as PanelistRole;
      if (state.currentRound == null || !Number.isFinite(state.currentRound)) {
        throw new MalformedBlockError(
          `PANELIST at position ${state.consumed + cursor} appeared before a valid <ROUND n="..."> opening`,
          state.consumed + cursor,
        );
      }
      const round = state.currentRound;

      yield { type: "panelist_open", runId: state.runId, round, role };

      yield* emitInner(state, role, body);

      const rawScore = Number(attrs["score"] ?? "0");
      const score = clampScore(rawScore, state.scoreScale);
      if (isOutOfRange(rawScore, state.scoreScale)) {
        yield {
          type: "parser_warning",
          runId: state.runId,
          kind: "score_clamped",
          position: state.consumed + cursor,
        };
      }
      yield { type: "panelist_close", runId: state.runId, round, role, score };

      cursor += closeIdx + "</PANELIST>".length;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    if (slice.startsWith("<ROUND_END ")) {
      if (!state.inRun) {
        throw new MalformedBlockError(
          `<ROUND_END> at position ${state.consumed + cursor} appeared before <CRITIQUE_RUN>`,
          state.consumed + cursor,
        );
      }
      const closeIdx = slice.indexOf("</ROUND_END>");
      if (closeIdx < 0) break;
      const blockText = slice.slice(0, closeIdx + "</ROUND_END>".length);
      const blockBytes = Buffer.byteLength(blockText, "utf8");
      if (blockBytes > state.parserMaxBlockBytes) {
        throw new OversizeBlockError(
          `ROUND_END block of ${blockBytes} bytes exceeded ${state.parserMaxBlockBytes} at position ${state.consumed + cursor}`,
          state.consumed + cursor,
        );
      }
      const headEnd = slice.indexOf(">");
      if (headEnd < 0) break;
      if (headEnd >= closeIdx) {
        throw new MalformedBlockError(
          `<ROUND_END> opening tag at position ${state.consumed + cursor} has no closing > before </ROUND_END>`,
          state.consumed + cursor,
        );
      }
      const attrs = parseAttrs(slice.slice("<ROUND_END".length, headEnd));
      const inner = slice.slice(headEnd + 1, closeIdx);
      const reason = (inner.match(/<REASON>([\s\S]*?)<\/REASON>/)?.[1] ?? "").trim();

      if (state.currentRound === 1 && !state.designerArtifactInRound1) {
        throw new MissingArtifactError(
          `round 1 closed at position ${state.consumed + cursor} without designer ARTIFACT`,
        );
      }

      yield {
        type: "round_end",
        runId: state.runId,
        round: Number(attrs["n"]),
        composite: Number(attrs["composite"] ?? "0"),
        mustFix: Number(attrs["must_fix"] ?? "0"),
        decision: attrs["decision"] === "ship" ? "ship" : "continue",
        reason,
      };
      state.currentRound = null;
      state.roundsClosed += 1;
      cursor += closeIdx + "</ROUND_END>".length;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    if (slice.startsWith("</ROUND>")) {
      cursor += "</ROUND>".length;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    if (slice.startsWith("<SHIP ")) {
      if (!state.inRun) {
        throw new MalformedBlockError(
          `<SHIP> at position ${state.consumed + cursor} appeared before <CRITIQUE_RUN>`,
          state.consumed + cursor,
        );
      }
      if (state.roundsClosed === 0) {
        throw new MalformedBlockError(
          `<SHIP> at position ${state.consumed + cursor} appeared before any <ROUND_END>`,
          state.consumed + cursor,
        );
      }
      const closeIdx = indexOfOutsideCdata(slice, "</SHIP>");
      if (closeIdx < 0) break;
      const blockText = slice.slice(0, closeIdx + "</SHIP>".length);
      const blockBytes = Buffer.byteLength(blockText, "utf8");
      if (blockBytes > state.parserMaxBlockBytes) {
        throw new OversizeBlockError(
          `SHIP block of ${blockBytes} bytes exceeded ${state.parserMaxBlockBytes} at position ${state.consumed + cursor}`,
          state.consumed + cursor,
        );
      }

      if (state.shipSeen) {
        yield {
          type: "parser_warning",
          runId: state.runId,
          kind: "duplicate_ship",
          position: state.consumed + cursor,
        };
        cursor += closeIdx + "</SHIP>".length;
        state.lastAdvance = state.consumed + cursor;
        continue;
      }

      state.shipSeen = true;
      const headEnd = slice.indexOf(">");
      if (headEnd < 0) break;
      if (headEnd >= closeIdx) {
        throw new MalformedBlockError(
          `<SHIP> opening tag at position ${state.consumed + cursor} has no closing > before </SHIP>`,
          state.consumed + cursor,
        );
      }
      const attrs = parseAttrs(slice.slice("<SHIP".length, headEnd));
      const inner = slice.slice(headEnd + 1, closeIdx);

      const artifactExtraction = extractArtifactBlock(inner);
      if (
        artifactExtraction === null ||
        artifactExtraction.body.trim().length === 0
      ) {
        throw new MissingArtifactError(
          `<SHIP> at position ${state.consumed + cursor} contains no <ARTIFACT> block or the block is empty`,
        );
      }

      const artifactAttrs = parseAttrs(artifactExtraction.attrText);
      const artifactMime = artifactAttrs["mime"] ?? "";
      const artifactBody = artifactExtraction.body;

      const summary = (
        inner
          .slice(artifactExtraction.blockEnd)
          .match(/<SUMMARY>([\s\S]*?)<\/SUMMARY>/)?.[1] ?? ""
      ).trim();

      const rawStatus = attrs["status"] ?? "";
      const validStatuses = [
        "shipped",
        "below_threshold",
        "timed_out",
        "interrupted",
      ] as const;
      const status = (
        validStatuses.includes(rawStatus as (typeof validStatuses)[number])
          ? rawStatus
          : "shipped"
      ) as "shipped" | "below_threshold" | "timed_out" | "interrupted";

      const shipRound = Number(attrs["round"] ?? "0");

      if (state.onArtifact) {
        state.onArtifact({
          round: shipRound,
          mime: artifactMime,
          body: artifactBody,
        });
      }

      yield {
        type: "ship",
        runId: state.runId,
        round: shipRound,
        composite: Number(attrs["composite"] ?? "0"),
        status,
        artifactRef: { projectId: state.projectId, artifactId: state.artifactId },
        summary,
      };
      cursor += closeIdx + "</SHIP>".length;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    if (slice.startsWith("</CRITIQUE_RUN>")) {
      state.inRun = false;
      cursor += "</CRITIQUE_RUN>".length;
      state.lastAdvance = state.consumed + cursor;
      continue;
    }

    const ch = slice.charAt(0);
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      cursor += 1;
      continue;
    }

    if (ch === "<") {
      break;
    }

    if (state.inRun) {
      throw new MalformedBlockError(
        `unexpected character "${ch}" at position ${state.consumed + cursor}`,
        state.consumed + cursor,
      );
    }

    cursor += 1;
  }

  state.consumed += cursor;
  state.buf = state.buf.slice(cursor);
}

function* emitInner(
  state: State,
  role: PanelistRole,
  inner: string,
): Generator<PanelEvent> {
  const round = state.currentRound;
  if (round == null || !Number.isFinite(round)) {
    return;
  }

  DIM_RE.lastIndex = 0;
  let dm: RegExpExecArray | null;
  while ((dm = DIM_RE.exec(inner)) !== null) {
    const raw = Number(dm[2]);
    const dimScore = clampScore(raw, state.scoreScale);
    if (isOutOfRange(raw, state.scoreScale)) {
      yield {
        type: "parser_warning",
        runId: state.runId,
        kind: "score_clamped",
        position: state.consumed,
      };
    }
    yield {
      type: "panelist_dim",
      runId: state.runId,
      round,
      role,
      dimName: dm[1] ?? "",
      dimScore,
      dimNote: (dm[3] ?? "").trim(),
    };
  }

  MUST_FIX_RE.lastIndex = 0;
  let mf: RegExpExecArray | null;
  while ((mf = MUST_FIX_RE.exec(inner)) !== null) {
    yield {
      type: "panelist_must_fix",
      runId: state.runId,
      round,
      role,
      text: (mf[1] ?? "").trim(),
    };
  }

  if (role === "designer" && round === 1 && /<ARTIFACT\b/.test(inner)) {
    state.designerArtifactInRound1 = true;
  }
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const key = m[1];
    if (key != null) out[key] = m[2] ?? "";
  }
  return out;
}

export function indexOfOutsideCdata(
  source: string,
  needle: string,
  startOffset = 0,
): number {
  let i = startOffset;
  while (i < source.length) {
    if (source.startsWith("<![CDATA[", i)) {
      const cdataEnd = source.indexOf("]]>", i + "<![CDATA[".length);
      if (cdataEnd < 0) {
        return -1;
      }
      i = cdataEnd + "]]>".length;
      continue;
    }
    if (source.startsWith(needle, i)) return i;
    i += 1;
  }
  return -1;
}

export function extractArtifactBlock(
  source: string,
): { attrText: string; body: string; blockEnd: number } | null {
  const openerMatch = source.match(/<ARTIFACT\b([^>]*)>/);
  if (
    !openerMatch ||
    openerMatch.index === undefined ||
    openerMatch[1] === undefined
  ) {
    return null;
  }
  const attrText = openerMatch[1];
  const bodyStart = openerMatch.index + openerMatch[0].length;
  const remainder = source.slice(bodyStart);

  const trimmed = remainder.trimStart();
  const leadingWs = remainder.length - trimmed.length;
  if (trimmed.startsWith("<![CDATA[")) {
    const cdataInnerStart = leadingWs + "<![CDATA[".length;
    const tailRe = /\]\]>\s*<\/ARTIFACT>/;
    const tailMatch = remainder.slice(cdataInnerStart).match(tailRe);
    if (!tailMatch || tailMatch.index === undefined || tailMatch[0] === undefined) {
      return null;
    }
    const body = remainder.slice(cdataInnerStart, cdataInnerStart + tailMatch.index);
    const blockEnd =
      bodyStart + cdataInnerStart + tailMatch.index + tailMatch[0].length;
    return { attrText, body, blockEnd };
  }

  const closeIdx = indexOfOutsideCdata(remainder, "</ARTIFACT>");
  if (closeIdx < 0) return null;
  const body = remainder.slice(0, closeIdx);
  const blockEnd = bodyStart + closeIdx + "</ARTIFACT>".length;
  return { attrText, body, blockEnd };
}

function isOutOfRange(n: number, scale: number): boolean {
  if (!isFinite(n)) return true;
  return n < 0 || n > scale;
}

function clampScore(n: number, scale: number): number {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > scale) return scale;
  return n;
}

// ---------------------------------------------------------------------------
// Scoreboard (port of critique/scoreboard.ts).
// ---------------------------------------------------------------------------

export type RoleScores = Partial<Record<PanelistRole, number>>;

export interface RoundState {
  n: number;
  scores: RoleScores;
  mustFix: number;
  composite: number;
}

export function computeComposite(
  scores: RoleScores,
  weights: CritiqueConfig["weights"],
): number {
  const roles = Object.keys(scores) as PanelistRole[];
  const present = roles.filter((r) => scores[r] !== undefined);
  if (present.length === 0) return 0;

  const totalWeight = present.reduce((s, r) => s + weights[r], 0);
  if (totalWeight < 1e-9) return 0;

  return present.reduce((s, r) => {
    const score = scores[r];
    if (score === undefined) return s;
    return s + (weights[r] / totalWeight) * score;
  }, 0);
}

export function decideRound(
  composite: number,
  mustFix: number,
  cfg: CritiqueConfig,
): RoundDecision {
  if (composite >= cfg.scoreThreshold - 1e-9 && mustFix === 0) {
    return "ship";
  }
  return "continue";
}

export function selectFallbackRound(
  rounds: RoundState[],
  policy: CritiqueConfig["fallbackPolicy"],
): RoundState | null {
  if (rounds.length === 0) return null;
  if (policy === "fail") return null;
  if (policy === "ship_last") {
    const last = rounds[rounds.length - 1];
    return last ?? null;
  }
  let best: RoundState | null = null;
  for (const r of rounds) {
    if (
      best === null ||
      r.composite > best.composite + 1e-9 ||
      (Math.abs(r.composite - best.composite) < 1e-9 && r.n > best.n)
    ) {
      best = r;
    }
  }
  return best;
}
