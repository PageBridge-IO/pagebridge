import { Command } from "commander";
import { createClient as createSanityClient } from "@sanity/client";
import {
  GSCClient,
  SyncEngine,
  DecayDetector,
  URLMatcher,
  TaskGenerator,
  type MatchResult,
  type UnmatchReason,
} from "@pagebridge/core";
import { createDb, sql, unmatchDiagnostics } from "@pagebridge/db";
import { resolve, requireConfig } from "../resolve-config.js";
import { log } from "../logger.js";
import { migrateIfRequested } from "../migrate.js";

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function createTimer(debug: boolean) {
  return {
    start: () => performance.now(),
    end: (label: string, startTime: number) => {
      if (debug) {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        log.debug(`${label} completed in ${elapsed}s`, true);
      }
    },
  };
}

export const syncCommand = new Command("sync")
  .description("Sync GSC data and generate refresh tasks")
  .requiredOption("--site <url>", "GSC site URL (e.g., sc-domain:example.com)")
  .option("--dry-run", "Preview changes without writing to Sanity")
  .option("--skip-tasks", "Only sync data, do not generate tasks")
  .option("--check-index", "Check Google index status for matched pages")
  .option("--quiet-period <days>", "Ignore pages published within N days", "45")
  .option("--diagnose", "Show detailed diagnostics for unmatched URLs")
  .option("--diagnose-url <url>", "Diagnose why a specific URL is not matching")
  .option("--debug", "Enable debug logging with timing information")
  .option("--migrate", "Run database migrations before syncing")
  .option("--google-service-account <json>", "Google service account JSON")
  .option("--db-url <url>", "PostgreSQL connection string")
  .option("--sanity-project-id <id>", "Sanity project ID")
  .option("--sanity-dataset <name>", "Sanity dataset name")
  .option("--sanity-token <token>", "Sanity API token")
  .option("--site-url <url>", "Your website base URL for URL matching")
  .action(async (options) => {
    const timer = createTimer(options.debug);
    const syncStartTime = timer.start();

    // Validate --quiet-period
    const quietPeriodDays = parseInt(options.quietPeriod as string);
    if (isNaN(quietPeriodDays)) {
      log.error(`Invalid --quiet-period value: "${options.quietPeriod}". Must be a number.`);
      process.exit(1);
    }

    const googleServiceAccount = resolve(options.googleServiceAccount, "GOOGLE_SERVICE_ACCOUNT");
    const dbUrl = resolve(options.dbUrl, "DATABASE_URL");
    const sanityProjectId = resolve(options.sanityProjectId, "SANITY_PROJECT_ID");
    const sanityDataset = resolve(options.sanityDataset, "SANITY_DATASET");
    const sanityToken = resolve(options.sanityToken, "SANITY_TOKEN");
    const siteUrl = resolve(options.siteUrl, "SITE_URL");

    requireConfig([
      { name: "GOOGLE_SERVICE_ACCOUNT", flag: "--google-service-account <json>", envVar: "GOOGLE_SERVICE_ACCOUNT", value: googleServiceAccount },
      { name: "DATABASE_URL", flag: "--db-url <url>", envVar: "DATABASE_URL", value: dbUrl },
      { name: "SANITY_PROJECT_ID", flag: "--sanity-project-id <id>", envVar: "SANITY_PROJECT_ID", value: sanityProjectId },
      { name: "SANITY_DATASET", flag: "--sanity-dataset <name>", envVar: "SANITY_DATASET", value: sanityDataset },
      { name: "SANITY_TOKEN", flag: "--sanity-token <token>", envVar: "SANITY_TOKEN", value: sanityToken },
      { name: "SITE_URL", flag: "--site-url <url>", envVar: "SITE_URL", value: siteUrl },
    ]);

    // Run migrations if requested
    await migrateIfRequested(!!options.migrate, dbUrl!);

    let t = timer.start();
    const sanity = createSanityClient({
      projectId: sanityProjectId!,
      dataset: sanityDataset!,
      token: sanityToken!,
      apiVersion: "2024-01-01",
      useCdn: false,
    });

    const { db, close } = createDb(dbUrl!);

    let credentials: { client_email: string; private_key: string };
    try {
      credentials = JSON.parse(googleServiceAccount!) as typeof credentials;
    } catch {
      log.error("Failed to parse GOOGLE_SERVICE_ACCOUNT as JSON");
      await close();
      process.exit(1);
    }

    const gsc = new GSCClient({ credentials });
    timer.end("Client initialization", t);

    // Register shutdown handlers
    const shutdown = async () => {
      log.warn("Received shutdown signal, closing connections...");
      await close();
      process.exit(130);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    // Pre-flight connection validation
    try {
      log.info("Validating connections...");

      t = timer.start();
      await db.execute(sql`SELECT 1`);
      timer.end("DB connection check", t);

      t = timer.start();
      await sanity.fetch('*[_type == "gscSite"][0]{ _id }');
      timer.end("Sanity connection check", t);

      t = timer.start();
      const sites = await gsc.listSites();
      timer.end("GSC connection check", t);
      if (!sites.includes(options.site as string)) {
        log.warn(`Site "${options.site}" not found in GSC site list. It may be new or the service account may lack access.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Pre-flight connection check failed: ${message}`);
      await close();
      process.exitCode = 1;
      process.removeListener("SIGTERM", shutdown);
      process.removeListener("SIGINT", shutdown);
      return;
    }

    log.info(`Starting sync for ${options.site}...`);

    // Find or create the gscSite document in Sanity
    t = timer.start();
    let siteDoc = await sanity.fetch<{
      _id: string;
      pathPrefix?: string;
      contentTypes?: string[];
      slugField?: string;
    } | null>(
      `*[_type == "gscSite" && siteUrl == $siteUrl][0]{
        _id,
        pathPrefix,
        contentTypes,
        slugField
      }`,
      { siteUrl: options.site },
    );

    if (!siteDoc) {
      log.info(`Creating gscSite document for ${options.site}...`);
      siteDoc = await sanity.create({
        _type: "gscSite",
        siteUrl: options.site,
        enabled: true,
        contentTypes: ["post", "page"],
        slugField: "slug",
      });
    }
    timer.end("Fetch gscSite document", t);

    const siteId = siteDoc._id;

    // Use configuration from gscSite document
    const contentTypes = siteDoc.contentTypes ?? ["post", "page"];
    const slugField = siteDoc.slugField ?? "slug";
    const pathPrefix = siteDoc.pathPrefix ?? undefined;

    log.info(`Configuration:`);
    log.info(`   Content types: ${contentTypes.join(", ")}`);
    log.info(`   Slug field: ${slugField}`);
    log.info(`   Path prefix: ${pathPrefix ?? "(none)"}`);

    const syncEngine = new SyncEngine({ gsc, db, sanity });
    const matcher = new URLMatcher(sanity, {
      contentTypes,
      slugField,
      baseUrl: siteUrl!,
      pathPrefix,
    });

    try {
      t = timer.start();
      const { pages, rowsProcessed } = await syncEngine.sync({
        siteUrl: options.site,
        startDate: daysAgo(90),
        endDate: daysAgo(3),
      });
      timer.end("GSC data sync", t);

      log.info(`Processed ${rowsProcessed} rows for ${pages.length} pages`);

      t = timer.start();
      const matches = await matcher.matchUrls(pages);
      timer.end("URL matching", t);

      const matched = matches.filter(
        (m): m is MatchResult & { sanityId: string } => !!m.sanityId,
      );
      const unmatched = matches.filter((m) => !m.sanityId);

      log.info(
        `Matched ${matched.length}/${pages.length} URLs to Sanity documents`,
      );

      // Store diagnostics for unmatched URLs
      if (unmatched.length > 0) {
        log.info(`${unmatched.length} unmatched URLs`);

        // Store diagnostics in database
        t = timer.start();
        for (const u of unmatched) {
          const diagId = `${options.site}:${u.gscUrl}`;
          await db
            .insert(unmatchDiagnostics)
            .values({
              id: diagId,
              siteId: options.site,
              gscUrl: u.gscUrl,
              extractedSlug: u.extractedSlug ?? null,
              unmatchReason: u.unmatchReason,
              normalizedUrl: u.diagnostics?.normalizedUrl ?? null,
              pathAfterPrefix: u.diagnostics?.pathAfterPrefix ?? null,
              configuredPrefix: u.diagnostics?.configuredPrefix ?? null,
              similarSlugs: u.diagnostics?.similarSlugs
                ? JSON.stringify(u.diagnostics.similarSlugs)
                : null,
              availableSlugsCount: u.diagnostics?.availableSlugsCount ?? null,
              lastSeenAt: new Date(),
            })
            .onConflictDoUpdate({
              target: unmatchDiagnostics.id,
              set: {
                extractedSlug: u.extractedSlug ?? null,
                unmatchReason: u.unmatchReason,
                normalizedUrl: u.diagnostics?.normalizedUrl ?? null,
                pathAfterPrefix: u.diagnostics?.pathAfterPrefix ?? null,
                configuredPrefix: u.diagnostics?.configuredPrefix ?? null,
                similarSlugs: u.diagnostics?.similarSlugs
                  ? JSON.stringify(u.diagnostics.similarSlugs)
                  : null,
                availableSlugsCount: u.diagnostics?.availableSlugsCount ?? null,
                lastSeenAt: new Date(),
              },
            });
        }

        // Update gscSite with unmatched count
        await sanity
          .patch(siteId)
          .set({
            unmatchedCount: unmatched.length,
            lastDiagnosticsAt: new Date().toISOString(),
          })
          .commit();
        timer.end("Store unmatched diagnostics", t);

        // Show detailed diagnostics if --diagnose flag is set
        if (options.diagnose) {
          log.info(`\nUnmatched URL Diagnostics:\n`);

          // Group by reason
          const byReason = new Map<UnmatchReason, MatchResult[]>();
          for (const u of unmatched) {
            const existing = byReason.get(u.unmatchReason) ?? [];
            existing.push(u);
            byReason.set(u.unmatchReason, existing);
          }

          for (const [reason, urls] of byReason) {
            log.info(
              `  ${getReasonEmoji(reason)} ${getReasonDescription(reason)} (${urls.length}):`,
            );
            const toShow = urls.slice(0, 5);
            for (const u of toShow) {
              log.info(`     ${u.gscUrl}`);
              if (u.extractedSlug) {
                log.info(`        Extracted slug: "${u.extractedSlug}"`);
              }
              if (u.diagnostics?.similarSlugs?.length) {
                log.info(`        Similar slugs in Sanity:`);
                for (const similar of u.diagnostics.similarSlugs) {
                  log.info(`          - ${similar}`);
                }
              }
            }
            if (urls.length > 5) {
              log.info(`     ... and ${urls.length - 5} more`);
            }
          }
        } else if (unmatched.length <= 10) {
          unmatched.forEach((u) => log.info(`   - ${u.gscUrl}`));
          log.info(`\n   Run with --diagnose for detailed diagnostics`);
        } else {
          log.info(`   Run with --diagnose to see detailed diagnostics`);
        }
      }

      // Handle --diagnose-url for a specific URL
      if (options.diagnoseUrl) {
        const targetUrl = options.diagnoseUrl as string;
        const allUrls = [targetUrl];
        const [result] = await matcher.matchUrls(allUrls);
        log.info(`\nDiagnostics for: ${targetUrl}\n`);
        if (result) {
          log.info(`   Matched: ${result.sanityId ? "Yes" : "No"}`);
          log.info(
            `   Reason: ${getReasonDescription(result.unmatchReason)}`,
          );
          if (result.extractedSlug) {
            log.info(`   Extracted slug: "${result.extractedSlug}"`);
          }
          if (result.matchedSlug) {
            log.info(`   Matched to Sanity slug: "${result.matchedSlug}"`);
          }
          if (result.diagnostics) {
            log.info(
              `   Normalized URL: ${result.diagnostics.normalizedUrl}`,
            );
            log.info(
              `   Path after prefix: ${result.diagnostics.pathAfterPrefix}`,
            );
            log.info(
              `   Configured prefix: ${result.diagnostics.configuredPrefix ?? "(none)"}`,
            );
            log.info(
              `   Available Sanity slugs: ${result.diagnostics.availableSlugsCount}`,
            );
            if (result.diagnostics.similarSlugs?.length) {
              log.info(`   Similar slugs in Sanity:`);
              for (const similar of result.diagnostics.similarSlugs) {
                log.info(`      - ${similar}`);
              }
            }
          }
        }
      }

      // Check index status if requested
      if (options.checkIndex && matched.length > 0) {
        log.info(`\nChecking index status for ${matched.length} pages...`);
        t = timer.start();
        const matchedUrls = matched.map((m) => m.gscUrl);
        const indexResult = await syncEngine.syncIndexStatus(
          options.site,
          matchedUrls,
        );
        timer.end("Index status check", t);
        log.info(
          `   Indexed: ${indexResult.indexed}, Not indexed: ${indexResult.notIndexed}, Skipped: ${indexResult.skipped}`,
        );
      }

      if (!options.skipTasks) {
        t = timer.start();
        const publishedDates = await getPublishedDates(sanity, matched);
        const detector = new DecayDetector(db);
        const signals = await detector.detectDecay(
          options.site,
          publishedDates,
          {
            enabled: true,
            days: quietPeriodDays,
          },
        );
        timer.end("Decay detection", t);

        log.info(`Detected ${signals.length} decay signals`);

        if (options.dryRun) {
          log.info("\nWould create the following tasks:");
          signals.forEach((s) => {
            log.info(`   [${s.severity.toUpperCase()}] ${s.page}`);
            log.info(`      Reason: ${s.reason}`);
            log.info(
              `      Position: ${s.metrics.positionBefore} -> ${s.metrics.positionNow}`,
            );
          });
        } else {
          t = timer.start();
          const taskGenerator = new TaskGenerator(sanity);
          const created = await taskGenerator.createTasks(
            siteId,
            signals,
            matches,
          );
          timer.end("Task generation", t);
          log.info(`Created ${created} new refresh tasks`);
        }
      }

      if (!options.dryRun) {
        t = timer.start();
        await syncEngine.writeSnapshots(siteId, matched);
        timer.end("Write Sanity snapshots", t);
        log.info(`Updated Sanity snapshots`);
      }

      timer.end("Total sync", syncStartTime);
      log.info(`\nSync complete!`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Sync failed: ${message}`);
      process.exitCode = 1;
    } finally {
      await close();
      process.removeListener("SIGTERM", shutdown);
      process.removeListener("SIGINT", shutdown);
    }
  });

async function getPublishedDates(
  sanity: ReturnType<typeof createSanityClient>,
  matches: MatchResult[],
): Promise<Map<string, Date>> {
  const ids = matches.map((m) => m.sanityId).filter(Boolean);
  const docs = await sanity.fetch<
    { _id: string; _createdAt: string; publishedAt?: string }[]
  >(`*[_id in $ids]{ _id, _createdAt, publishedAt }`, { ids });

  const map = new Map<string, Date>();
  for (const doc of docs) {
    const match = matches.find((m) => m.sanityId === doc._id);
    if (match) {
      const dateStr = doc.publishedAt ?? doc._createdAt;
      map.set(match.gscUrl, new Date(dateStr));
    }
  }
  return map;
}

function getReasonEmoji(reason: UnmatchReason): string {
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

function getReasonDescription(reason: UnmatchReason): string {
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
      return "Unknown reason";
  }
}
