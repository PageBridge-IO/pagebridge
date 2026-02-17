import { log } from "./logger.js";

/**
 * Resolves a config value from:
 *  1. CLI option (highest priority)
 *  2. PAGEBRIDGE_ prefixed env var (e.g. PAGEBRIDGE_DATABASE_URL)
 *  3. Unprefixed env var fallback (e.g. DATABASE_URL)
 */
export function resolve(
  optionValue: string | undefined,
  envVarName: string,
): string | undefined {
  return (
    optionValue ??
    process.env[`PAGEBRIDGE_${envVarName}`] ??
    process.env[envVarName]
  );
}

export interface ConfigEntry {
  name: string;
  flag: string;
  envVar: string;
  value: string | undefined;
}

export class MissingConfigError extends Error {
  constructor(missing: ConfigEntry[]) {
    const lines = ["Missing required configuration."];
    for (const entry of missing) {
      lines.push(`  ${entry.name}`);
      lines.push(
        `    ${entry.flag}  or  PAGEBRIDGE_${entry.envVar} / ${entry.envVar} env var`,
      );
    }
    super(lines.join("\n"));
    this.name = "MissingConfigError";
  }
}

/**
 * Validates that all required config entries have values.
 * If any are missing, logs the error details and throws MissingConfigError.
 */
export function requireConfig(entries: ConfigEntry[]): void {
  const missing = entries.filter((e) => !e.value);
  if (missing.length === 0) return;

  log.error("Missing required configuration.\n");
  for (const entry of missing) {
    log.error(`  ${entry.name}`);
    log.error(
      `    ${entry.flag}  or  PAGEBRIDGE_${entry.envVar} / ${entry.envVar} env var\n`,
    );
  }
  throw new MissingConfigError(missing);
}
