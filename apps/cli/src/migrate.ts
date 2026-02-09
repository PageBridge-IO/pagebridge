import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "@pagebridge/db";
import { log } from "./logger.js";

export async function migrateIfRequested(shouldMigrate: boolean, dbUrl: string) {
  if (!shouldMigrate) return;
  log.info("Running database migrations...");
  const pkgPath = import.meta.resolve("@pagebridge/db");
  const migrationsFolder = resolve(fileURLToPath(pkgPath), "../../drizzle");
  await runMigrations(dbUrl, migrationsFolder);
  log.info("Migrations complete.");
}
