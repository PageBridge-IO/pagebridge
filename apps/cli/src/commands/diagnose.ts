import { Command } from "commander";
import {
  createDb,
  unmatchDiagnostics,
  eq,
  desc,
} from "@pagebridge/db";
import { resolve, requireConfig } from "../resolve-config.js";
import { log } from "../logger.js";
import { migrateIfRequested } from "../migrate.js";

export const diagnoseCommand = new Command("diagnose")
  .description("View diagnostics for unmatched URLs")
  .requiredOption("--site <url>", "GSC site URL (e.g., sc-domain:example.com)")
  .option("--reason <reason>", "Filter by unmatch reason")
  .option("--limit <n>", "Limit number of results", "20")
  .option("--json", "Output as JSON")
  .option("--migrate", "Run database migrations before querying")
  .option("--db-url <url>", "PostgreSQL connection string")
  .action(async (options) => {
    const dbUrl = resolve(options.dbUrl, "DATABASE_URL");

    requireConfig([
      { name: "DATABASE_URL", flag: "--db-url <url>", envVar: "DATABASE_URL", value: dbUrl },
    ]);

    // Run migrations if requested
    await migrateIfRequested(!!options.migrate, dbUrl!);

    const { db, close } = createDb(dbUrl!);

    // Register shutdown handlers
    const shutdown = async () => {
      log.warn("Received shutdown signal, closing connections...");
      await close();
      process.exit(130);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    try {
      const query = db
        .select()
        .from(unmatchDiagnostics)
        .where(eq(unmatchDiagnostics.siteId, options.site))
        .orderBy(desc(unmatchDiagnostics.lastSeenAt))
        .limit(parseInt(options.limit));

      const results = await query;

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      if (results.length === 0) {
        log.info(`No unmatched URLs found for ${options.site}`);
        log.info(
          `Run 'sync --site ${options.site}' first to generate diagnostics.`,
        );
        return;
      }

      // Group by reason
      const byReason = new Map<string, typeof results>();
      for (const r of results) {
        const existing = byReason.get(r.unmatchReason) ?? [];
        existing.push(r);
        byReason.set(r.unmatchReason, existing);
      }

      log.info(`\nUnmatched URL Diagnostics for ${options.site}\n`);
      log.info(`Total: ${results.length} unmatched URLs\n`);

      for (const [reason, items] of byReason) {
        log.info(
          `${getReasonEmoji(reason)} ${getReasonDescription(reason)} (${items.length}):`,
        );

        for (const item of items) {
          log.info(`  ${item.gscUrl}`);
          if (item.extractedSlug) {
            log.info(`    Extracted slug: "${item.extractedSlug}"`);
          }
          if (item.similarSlugs) {
            try {
              const similar = JSON.parse(item.similarSlugs) as string[];
              if (similar.length > 0) {
                log.info(`    Similar slugs in Sanity:`);
                for (const s of similar) {
                  log.info(`      - ${s}`);
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      log.info(`\nTo fix unmatched URLs:`);
      log.info(
        `  1. Check if the Sanity document exists with the correct slug`,
      );
      log.info(`  2. Verify the document type is in the contentTypes list`);
      log.info(`  3. Ensure the slug field name matches your configuration`);
      log.info(
        `  4. If using a path prefix, verify it matches your URL structure`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Diagnose failed: ${message}`);
      process.exitCode = 1;
    } finally {
      await close();
      process.removeListener("SIGTERM", shutdown);
      process.removeListener("SIGINT", shutdown);
    }
  });

function getReasonEmoji(reason: string): string {
  switch (reason) {
    case "matched":
      return "[OK]";
    case "no_slug_extracted":
      return "[SLUG]";
    case "no_matching_document":
      return "[DOC]";
    case "outside_path_prefix":
      return "[PREFIX]";
    default:
      return "[?]";
  }
}

function getReasonDescription(reason: string): string {
  switch (reason) {
    case "matched":
      return "Successfully matched";
    case "no_slug_extracted":
      return "Could not extract slug from URL";
    case "no_matching_document":
      return "No Sanity document with matching slug";
    case "outside_path_prefix":
      return "URL outside configured path prefix";
    default:
      return `Unknown reason: ${reason}`;
  }
}
