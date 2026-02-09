/**
 * Resolves a config value from a CLI option first, then env var fallback.
 */
export function resolve(
  optionValue: string | undefined,
  envVarName: string,
): string | undefined {
  return optionValue ?? process.env[envVarName];
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
    console.error(`    ${entry.flag}  or  ${entry.envVar} env var\n`);
  }
  process.exit(1);
}
