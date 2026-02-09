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

interface ConfigEntry {
  name: string;
  flag: string;
  envVar: string;
  value: string | undefined;
}

/**
 * Validates that all required config entries have values.
 * If any are missing, prints a clear error listing every missing entry and exits.
 */
export function requireConfig(entries: ConfigEntry[]): void {
  const missing = entries.filter((e) => !e.value);
  if (missing.length === 0) return;

  console.error("Error: Missing required configuration.\n");
  for (const entry of missing) {
    console.error(`  ${entry.name}`);
    console.error(
      `    ${entry.flag}  or  PAGEBRIDGE_${entry.envVar} / ${entry.envVar} env var\n`,
    );
  }
  process.exit(1);
}
