const NO_TOOLS_DEFAULT = 2;
const PLATFORM_DEFAULT = 20;
const HARD_CAP = 50;

function readEnvInt(key: string): number | null {
  const raw = process.env[key];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function resolveMaxSteps(modelConfig: unknown, hasTools: boolean): number {
  if (!hasTools) return NO_TOOLS_DEFAULT;

  const platformDefault = readEnvInt("RANTAI_DEFAULT_MAX_STEPS") ?? PLATFORM_DEFAULT;
  const hardCap = readEnvInt("RANTAI_MAX_STEPS_HARD_CAP") ?? HARD_CAP;

  const cfg =
    modelConfig && typeof modelConfig === "object"
      ? (modelConfig as { maxSteps?: unknown })
      : null;
  const requested = Number(cfg?.maxSteps);
  const valid = Number.isFinite(requested) && requested > 0;
  const desired = valid ? requested : platformDefault;

  return Math.min(Math.max(Math.trunc(desired), 1), hardCap);
}
