import { Command } from "commander";
import { createClient as createSanityClient } from "@sanity/client";
import {
  GSCClient,
  SyncEngine,
  DecayDetector,
  URLMatcher,
  TaskGenerator,
  QuickWinAnalyzer,
  CtrAnomalyAnalyzer,
  DailyMetricsCollector,
  PublishingImpactAnalyzer,
  CannibalizationAnalyzer,
  SiteInsightAnalyzer,
  InsightWriter,
  daysAgo,
  type SnapshotInsights,
  type MatchResult,
  type DecaySignal,
} from "@pagebridge/core";
import { createDb, sql, unmatchDiagnostics } from "@pagebridge/db";
import { resolve, requireConfig } from "../resolve-config.js";
import { normalizeUrlConfigs } from "../normalize-url-configs.js";
import { log } from "../logger.js";
import { migrateIfRequested } from "../migrate.js";

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
  .option(
    "--skip-insights",
    "Skip insight analysis (quick wins, etc.) for faster sync",
  )
  .option("--debug", "Enable debug logging with timing information")
  .option("--migrate", "Run database migrations before syncing")
  .option("--google-service-account <json>", "Google service account JSON")
  .option("--db-url <url>", "PostgreSQL connection string")
  .option("--sanity-project-id <id>", "Sanity project ID")
  .option("--sanity-dataset <name>", "Sanity dataset name")
  .option("--sanity-token <token>", "Sanity API token")
  .option("--site-url <url>", "Your website base URL for URL matching")
  .addHelpText(
    "after",
    `
Examples:
  $ pagebridge sync --site sc-domain:example.com
  $ pagebridge sync --site sc-domain:example.com --dry-run
  $ pagebridge sync --site sc-domain:example.com --migrate --debug
  $ pagebridge sync --site sc-domain:example.com --skip-insights --skip-tasks
`,
  )
  .action(async (options) => {
    const timer = createTimer(options.debug);
    const syncStartTime = timer.start();

    // Validate --quiet-period
    const quietPeriodDays = parseInt(options.quietPeriod as string);
    if (isNaN(quietPeriodDays)) {
      log.error(
        `Invalid --quiet-period value: "${options.quietPeriod}". Must be a number.`,
      );
      process.exit(1);
    }

    const googleServiceAccount = resolve(
      options.googleServiceAccount,
      "GOOGLE_SERVICE_ACCOUNT",
    );
    const dbUrl = resolve(options.dbUrl, "DATABASE_URL");
    const sanityProjectId = resolve(
      options.sanityProjectId,
      "SANITY_PROJECT_ID",
    );
    const sanityDataset = resolve(options.sanityDataset, "SANITY_DATASET");
    const sanityToken = resolve(options.sanityToken, "SANITY_TOKEN");
    const siteUrl = resolve(options.siteUrl, "SITE_URL");

    requireConfig([
      {
        name: "GOOGLE_SERVICE_ACCOUNT",
        flag: "--google-service-account <json>",
        envVar: "GOOGLE_SERVICE_ACCOUNT",
        value: googleServiceAccount,
      },
      {
        name: "DATABASE_URL",
        flag: "--db-url <url>",
        envVar: "DATABASE_URL",
        value: dbUrl,
      },
      {
        name: "SANITY_PROJECT_ID",
        flag: "--sanity-project-id <id>",
        envVar: "SANITY_PROJECT_ID",
        value: sanityProjectId,
      },
      {
        name: "SANITY_DATASET",
        flag: "--sanity-dataset <name>",
        envVar: "SANITY_DATASET",
        value: sanityDataset,
      },
      {
        name: "SANITY_TOKEN",
        flag: "--sanity-token <token>",
        envVar: "SANITY_TOKEN",
        value: sanityToken,
      },
      {
        name: "SITE_URL",
        flag: "--site-url <url>",
        envVar: "SITE_URL",
        value: siteUrl,
      },
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
        log.warn(
          `Site "${options.site}" not found in GSC site list. It may be new or the service account may lack access.`,
        );
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
      urlConfigs?: Array<{
        contentType: string;
        pathPrefix?: string;
        slugField?: string;
      }>;
      // Deprecated fields for backward compatibility
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
      log.info(`Creating gscSite document for ${options.site}...`);
      siteDoc = await sanity.create({
        _type: "gscSite",
        siteUrl: options.site,
        enabled: true,
        urlConfigs: [
          { contentType: "post", slugField: "slug" },
          { contentType: "page", slugField: "slug" },
        ],
      });
    }
    timer.end("Fetch gscSite document", t);

    const siteId = siteDoc._id;

    const urlConfigs = normalizeUrlConfigs(siteDoc);

    log.info(`Configuration:`);
    for (const config of urlConfigs) {
      log.info(
        `   ${config.contentType}: ${config.slugField} at ${config.pathPrefix ?? "(root)"}`,
      );
    }

    const syncEngine = new SyncEngine({ gsc, db, sanity });
    const matcher = new URLMatcher(sanity, {
      urlConfigs,
      baseUrl: siteUrl!,
    });

    try {
      t = timer.start();
      const { pages, rowsProcessed } = await syncEngine.sync({
        siteUrl: options.site,
        startDate: daysAgo(90),
        endDate: daysAgo(3),
        onProgress: (msg) => log.info(msg),
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

        log.info(
          `   Run 'pagebridge diagnose --site ${options.site}' for detailed diagnostics`,
        );
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

      // Decay detection (runs regardless, used for both tasks and alerts)
      let decaySignals: DecaySignal[] = [];
      if (!options.skipTasks) {
        t = timer.start();
        const publishedDates = await getPublishedDates(sanity, matched);
        const detector = new DecayDetector(db);
        decaySignals = await detector.detectDecay(
          options.site,
          publishedDates,
          {
            enabled: true,
            days: quietPeriodDays,
          },
        );
        timer.end("Decay detection", t);

        log.info(`Detected ${decaySignals.length} decay signals`);

        if (options.dryRun) {
          log.info("\nWould create the following tasks:");
          decaySignals.forEach((s) => {
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
            decaySignals,
            matches,
          );
          timer.end("Task generation", t);
          log.info(`Created ${created} new refresh tasks`);
        }
      }

      // Insight analysis (quick wins, CTR anomalies, daily metrics, publishing impact, cannibalization)
      const insights: SnapshotInsights = {};
      if (!options.dryRun && !options.skipInsights) {
        t = timer.start();

        // Quick wins
        try {
          const quickWinAnalyzer = new QuickWinAnalyzer(db);
          insights.quickWins = await quickWinAnalyzer.analyze(options.site);
          const totalQuickWins = Array.from(insights.quickWins.values()).reduce(
            (sum: number, arr) => sum + (arr as unknown[]).length,
            0 as number,
          );
          log.info(
            `Found ${totalQuickWins} quick-win queries across ${insights.quickWins.size} pages`,
          );
        } catch (error) {
          log.warn(`Quick win analysis failed: ${error instanceof Error ? error.message : error}`);
          insights.quickWins = new Map();
        }

        // CTR anomalies
        try {
          const ctrAnalyzer = new CtrAnomalyAnalyzer(db);
          insights.ctrAnomalies = await ctrAnalyzer.analyze(options.site);
          log.info(`Found ${insights.ctrAnomalies.size} CTR anomalies`);
        } catch (error) {
          log.warn(`CTR anomaly analysis failed: ${error instanceof Error ? error.message : error}`);
          insights.ctrAnomalies = new Map();
        }

        // Daily metrics for sparklines
        try {
          const dailyCollector = new DailyMetricsCollector(db);
          insights.dailyMetrics = await dailyCollector.collect(options.site);
          log.info(`Collected daily metrics for ${insights.dailyMetrics.size} pages`);
        } catch (error) {
          log.warn(`Daily metrics collection failed: ${error instanceof Error ? error.message : error}`);
          insights.dailyMetrics = new Map();
        }

        // Publishing impact
        try {
          const editDates = await getDocumentDates(sanity, matched);
          const impactAnalyzer = new PublishingImpactAnalyzer(db);
          insights.publishingImpact = await impactAnalyzer.analyze(
            options.site,
            editDates,
          );
          log.info(
            `Computed publishing impact for ${insights.publishingImpact.size} pages`,
          );
        } catch (error) {
          log.warn(`Publishing impact analysis failed: ${error instanceof Error ? error.message : error}`);
          insights.publishingImpact = new Map();
        }

        // Cannibalization (per-page targets for snapshots)
        const cannibalizationAnalyzer = new CannibalizationAnalyzer(db);
        try {
          const cannibalizationResults =
            await cannibalizationAnalyzer.analyzeForPages(options.site, matched);
          insights.cannibalizationTargets = cannibalizationResults;
          const totalCannibalized = Array.from(
            cannibalizationResults.values(),
          ).filter((targets) => (targets as unknown[]).length > 0).length;
          log.info(
            `Found cannibalization on ${totalCannibalized} pages`,
          );
        } catch (error) {
          log.warn(`Cannibalization analysis failed: ${error instanceof Error ? error.message : error}`);
          insights.cannibalizationTargets = new Map();
        }

        // Track decay pages for alert generation
        if (decaySignals.length > 0) {
          insights.decayPages = new Set(decaySignals.map((s) => s.page));
        }

        // Site-wide insights (top performers, zero-click, orphans, new keywords)
        try {
          const siteInsightAnalyzer = new SiteInsightAnalyzer(db);
          const siteInsightData = await siteInsightAnalyzer.analyze(
            options.site,
            pages,
          );

          // Site-wide cannibalization groups for the dashboard
          const cannibalizationGroups =
            await cannibalizationAnalyzer.analyzeSiteWide(options.site);

          // Build match lookup for document titles
          const matchLookup = new Map<string, { sanityId: string; title?: string }>();
          const docIds = matched.map((m) => m.sanityId).filter(Boolean);
          if (docIds.length > 0) {
            const docs = await sanity.fetch<{ _id: string; title?: string }[]>(
              `*[_id in $ids]{ _id, title }`,
              { ids: docIds },
            );
            for (const doc of docs) {
              const match = matched.find((m) => m.sanityId === doc._id);
              if (match) {
                matchLookup.set(match.gscUrl, {
                  sanityId: doc._id,
                  title: doc.title,
                });
              }
            }
          }

          // Write site-wide insights to Sanity
          const insightWriter = new InsightWriter(sanity);
          await insightWriter.write(
            siteId,
            siteInsightData,
            cannibalizationGroups,
            matchLookup,
            insights.quickWins,
          );
          log.info(
            `Wrote site insights: ${siteInsightData.topPerformers.length} top performers, ` +
              `${siteInsightData.zeroClickPages.length} zero-click, ` +
              `${siteInsightData.orphanPages.length} orphan, ` +
              `${siteInsightData.newKeywordOpportunities.length} new keywords, ` +
              `${cannibalizationGroups.length} cannibalization groups`,
          );
        } catch (error) {
          log.warn(`Site insight analysis failed: ${error instanceof Error ? error.message : error}`);
        }

        timer.end("Insight analysis", t);
      }

      if (!options.dryRun) {
        t = timer.start();
        await syncEngine.writeSnapshots(
          siteId,
          matched,
          undefined,
          insights,
          (msg) => log.info(msg),
        );
        timer.end("Write Sanity snapshots", t);
        log.info(`Updated Sanity snapshots`);
      }

      timer.end("Total sync", syncStartTime);
      log.info(`Sync complete!`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Sync failed: ${message}`);
      process.exitCode = 1;
    } finally {
      await close();
      process.removeListener("SIGTERM", shutdown);
      process.removeListener("SIGINT", shutdown);
      // Sanity client and GSC client keep HTTP connections alive with no close() API.
      // Force exit so the process doesn't hang indefinitely.
      process.exit(process.exitCode ?? 0);
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

/**
 * Fetches _updatedAt dates for matched documents.
 * Used by PublishingImpactAnalyzer to compare before/after edit metrics.
 *
 * Limitation: _updatedAt includes ALL document updates (schema changes,
 * metadata edits, etc.), not just content edits. For more accurate results,
 * add a dedicated `contentLastEditedAt` field to your content documents.
 */
async function getDocumentDates(
  sanity: ReturnType<typeof createSanityClient>,
  matches: MatchResult[],
): Promise<Map<string, Date>> {
  const ids = matches.map((m) => m.sanityId).filter(Boolean);
  const docs = await sanity.fetch<
    { _id: string; _updatedAt: string }[]
  >(`*[_id in $ids]{ _id, _updatedAt }`, { ids });

  const map = new Map<string, Date>();
  for (const doc of docs) {
    const match = matches.find((m) => m.sanityId === doc._id);
    if (match) {
      map.set(match.gscUrl, new Date(doc._updatedAt));
    }
  }
  return map;
}

