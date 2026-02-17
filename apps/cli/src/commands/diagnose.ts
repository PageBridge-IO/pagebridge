import { Command } from "commander";
import {
  createDb,
  unmatchDiagnostics,
  eq,
  desc,
} from "@pagebridge/db";
import { createClient as createSanityClient } from "@sanity/client";
import { URLMatcher } from "@pagebridge/core";
import { resolve, requireConfig } from "../resolve-config.js";
import { normalizeUrlConfigs } from "../normalize-url-configs.js";
import { log } from "../logger.js";
import { migrateIfRequested } from "../migrate.js";

export const diagnoseCommand = new Command("diagnose")
  .description("View diagnostics for unmatched URLs")
  .requiredOption("--site <url>", "GSC site URL (e.g., sc-domain:example.com)")
  .option("--url <url>", "Diagnose why a specific URL is not matching (live check against Sanity)")
  .option("--reason <reason>", "Filter by unmatch reason")
  .option("--limit <n>", "Limit number of results", "20")
  .option("--json", "Output as JSON")
  .option("--migrate", "Run database migrations before querying")
  .option("--db-url <url>", "PostgreSQL connection string")
  .option("--sanity-project-id <id>", "Sanity project ID")
  .option("--sanity-dataset <name>", "Sanity dataset name")
  .option("--sanity-token <token>", "Sanity API token")
  .option("--site-url <url>", "Your website base URL for URL matching")
  .addHelpText(
    "after",
    `
Examples:
  $ pagebridge diagnose --site sc-domain:example.com
  $ pagebridge diagnose --site sc-domain:example.com --url https://example.com/blog/my-post
  $ pagebridge diagnose --site sc-domain:example.com --reason no_matching_document --limit 50
  $ pagebridge diagnose --site sc-domain:example.com --json
`,
  )
  .action(async (options) => {
    // --url mode: live URL matching against Sanity (no database needed)
    if (options.url) {
      await diagnoseUrl(options);
      return;
    }

    // Default mode: query stored diagnostics from database
    await diagnoseSummary(options);
  });

/**
 * Live URL diagnosis: connects to Sanity, fetches gscSite config,
 * and runs the URL matcher to diagnose a specific URL.
 */
async function diagnoseUrl(options: Record<string, unknown>) {
  const sanityProjectId = resolve(options.sanityProjectId as string | undefined, "SANITY_PROJECT_ID");
  const sanityDataset = resolve(options.sanityDataset as string | undefined, "SANITY_DATASET");
  const sanityToken = resolve(options.sanityToken as string | undefined, "SANITY_TOKEN");
  const siteUrl = resolve(options.siteUrl as string | undefined, "SITE_URL");

  requireConfig([
    { name: "SANITY_PROJECT_ID", flag: "--sanity-project-id <id>", envVar: "SANITY_PROJECT_ID", value: sanityProjectId },
    { name: "SANITY_DATASET", flag: "--sanity-dataset <name>", envVar: "SANITY_DATASET", value: sanityDataset },
    { name: "SANITY_TOKEN", flag: "--sanity-token <token>", envVar: "SANITY_TOKEN", value: sanityToken },
    { name: "SITE_URL", flag: "--site-url <url>", envVar: "SITE_URL", value: siteUrl },
  ]);

  const sanity = createSanityClient({
    projectId: sanityProjectId!,
    dataset: sanityDataset!,
    token: sanityToken!,
    apiVersion: "2024-01-01",
    useCdn: false,
  });

  try {
    // Fetch gscSite config
    const siteDoc = await sanity.fetch<{
      _id: string;
      urlConfigs?: Array<{
        contentType: string;
        pathPrefix?: string;
        slugField?: string;
      }>;
      pathPrefix?: string;
      contentTypes?: string[];
      slugField?: string;
    } | null>(
      `*[_type == "gscSite" && siteUrl == $siteUrl][0]{
        _id,
        urlConfigs,
        pathPrefix,
        contentTypes,
        slugField
      }`,
      { siteUrl: options.site },
    );

    if (!siteDoc) {
      log.error(`No gscSite document found for ${options.site}. Run 'sync --site ${options.site}' first.`);
      process.exitCode = 1;
      return;
    }

    const urlConfigs = normalizeUrlConfigs(siteDoc);

    log.info(`Configuration:`);
    for (const config of urlConfigs) {
      log.info(`   ${config.contentType}: ${config.slugField} at ${config.pathPrefix ?? "(root)"}`);
    }

    const matcher = new URLMatcher(sanity, { urlConfigs, baseUrl: siteUrl! });
    const targetUrl = options.url as string;
    const [result] = await matcher.matchUrls([targetUrl]);

    log.info(`\nDiagnostics for: ${targetUrl}\n`);

    if (result) {
      log.info(`   Matched: ${result.sanityId ? "Yes" : "No"}`);
      log.info(`   Reason: ${getReasonDescription(result.unmatchReason)}`);
      if (result.extractedSlug) {
        log.info(`   Extracted slug: "${result.extractedSlug}"`);
      }
      if (result.matchedSlug) {
        log.info(`   Matched to Sanity slug: "${result.matchedSlug}"`);
      }
      if (result.diagnostics) {
        log.info(`   Normalized URL: ${result.diagnostics.normalizedUrl}`);
        log.info(`   Path after prefix: ${result.diagnostics.pathAfterPrefix}`);
        log.info(`   Configured prefix: ${result.diagnostics.configuredPrefix ?? "(none)"}`);
        log.info(`   Available Sanity slugs: ${result.diagnostics.availableSlugsCount}`);
        if (result.diagnostics.similarSlugs?.length) {
          log.info(`   Similar slugs in Sanity:`);
          for (const similar of result.diagnostics.similarSlugs) {
            log.info(`      - ${similar}`);
          }
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Diagnose failed: ${message}`);
    process.exitCode = 1;
  } finally {
    // Sanity client keeps HTTP connections alive — force exit
    process.exit(process.exitCode ?? 0);
  }
}

/**
 * Summary diagnosis: queries stored diagnostics from the database
 * (populated by the sync command).
 */
async function diagnoseSummary(options: Record<string, unknown>) {
  const dbUrl = resolve(options.dbUrl as string | undefined, "DATABASE_URL");

  requireConfig([
    { name: "DATABASE_URL", flag: "--db-url <url>", envVar: "DATABASE_URL", value: dbUrl },
  ]);

  // Validate --limit
  const limit = parseInt(options.limit as string);
  if (isNaN(limit)) {
    log.error(
      `Invalid --limit value: "${options.limit}". Must be a number.`,
    );
    process.exit(1);
  }

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
      .where(eq(unmatchDiagnostics.siteId, options.site as string))
      .orderBy(desc(unmatchDiagnostics.lastSeenAt))
      .limit(limit);

    const results = await query;

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (results.length === 0) {
      log.info(`No unmatched URLs found for ${options.site}`);
      log.info(
        `Run 'pagebridge sync --site ${options.site}' first to generate diagnostics.`,
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
    log.info(`  2. Verify the document type is in your urlConfigs`);
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
    // DB connection keeps the process alive — force exit like sync command does
    process.exit(process.exitCode ?? 0);
  }
}

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
