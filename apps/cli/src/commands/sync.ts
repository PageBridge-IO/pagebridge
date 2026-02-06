import { Command } from "commander";
import { createClient as createSanityClient } from "@sanity/client";
import postgres from "postgres";
import {
  GSCClient,
  SyncEngine,
  DecayDetector,
  URLMatcher,
  TaskGenerator,
  type MatchResult,
  type UnmatchReason,
} from "@pagebridge/core";
import { createDbWithClient, unmatchDiagnostics } from "@pagebridge/db";

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
        console.log(`[DEBUG] ${label} completed in ${elapsed}s`);
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
  .action(async (options) => {
    const timer = createTimer(options.debug);
    const syncStartTime = timer.start();
    const requiredEnvVars = [
      "GOOGLE_SERVICE_ACCOUNT",
      "DATABASE_URL",
      "SANITY_PROJECT_ID",
      "SANITY_DATASET",
      "SANITY_TOKEN",
      "SITE_URL",
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        console.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
      }
    }

    let t = timer.start();
    const sanity = createSanityClient({
      projectId: process.env.SANITY_PROJECT_ID!,
      dataset: process.env.SANITY_DATASET!,
      token: process.env.SANITY_TOKEN!,
      apiVersion: "2024-01-01",
      useCdn: false,
    });

    const sql = postgres(process.env.DATABASE_URL!);
    const db = createDbWithClient(sql);

    const gsc = new GSCClient({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT!),
    });
    timer.end("Client initialization", t);

    console.log(`Starting sync for ${options.site}...`);

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
      console.log(`Creating gscSite document for ${options.site}...`);
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

    console.log(`Configuration:`);
    console.log(`   Content types: ${contentTypes.join(", ")}`);
    console.log(`   Slug field: ${slugField}`);
    console.log(`   Path prefix: ${pathPrefix ?? "(none)"}`);

    const syncEngine = new SyncEngine({ gsc, db, sanity });
    const matcher = new URLMatcher(sanity, {
      contentTypes,
      slugField,
      baseUrl: process.env.SITE_URL!,
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

      console.log(`Processed ${rowsProcessed} rows for ${pages.length} pages`);

      t = timer.start();
      const matches = await matcher.matchUrls(pages);
      timer.end("URL matching", t);

      const matched = matches.filter(
        (m): m is MatchResult & { sanityId: string } => !!m.sanityId,
      );
      const unmatched = matches.filter((m) => !m.sanityId);

      console.log(
        `Matched ${matched.length}/${pages.length} URLs to Sanity documents`,
      );

      // Store diagnostics for unmatched URLs
      if (unmatched.length > 0) {
        console.log(`${unmatched.length} unmatched URLs`);

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
          console.log(`\nUnmatched URL Diagnostics:\n`);

          // Group by reason
          const byReason = new Map<UnmatchReason, MatchResult[]>();
          for (const u of unmatched) {
            const existing = byReason.get(u.unmatchReason) ?? [];
            existing.push(u);
            byReason.set(u.unmatchReason, existing);
          }

          for (const [reason, urls] of byReason) {
            console.log(
              `  ${getReasonEmoji(reason)} ${getReasonDescription(reason)} (${urls.length}):`,
            );
            const toShow = urls.slice(0, 5);
            for (const u of toShow) {
              console.log(`     ${u.gscUrl}`);
              if (u.extractedSlug) {
                console.log(`        Extracted slug: "${u.extractedSlug}"`);
              }
              if (u.diagnostics?.similarSlugs?.length) {
                console.log(`        Similar slugs in Sanity:`);
                for (const similar of u.diagnostics.similarSlugs) {
                  console.log(`          - ${similar}`);
                }
              }
            }
            if (urls.length > 5) {
              console.log(`     ... and ${urls.length - 5} more`);
            }
            console.log();
          }
        } else if (unmatched.length <= 10) {
          unmatched.forEach((u) => console.log(`   - ${u.gscUrl}`));
          console.log(`\n   Run with --diagnose for detailed diagnostics`);
        } else {
          console.log(`   Run with --diagnose to see detailed diagnostics`);
        }
      }

      // Handle --diagnose-url for a specific URL
      if (options.diagnoseUrl) {
        const targetUrl = options.diagnoseUrl;
        const allUrls = [targetUrl];
        const [result] = await matcher.matchUrls(allUrls);
        console.log(`\nDiagnostics for: ${targetUrl}\n`);
        if (result) {
          console.log(`   Matched: ${result.sanityId ? "Yes" : "No"}`);
          console.log(
            `   Reason: ${getReasonDescription(result.unmatchReason)}`,
          );
          if (result.extractedSlug) {
            console.log(`   Extracted slug: "${result.extractedSlug}"`);
          }
          if (result.matchedSlug) {
            console.log(`   Matched to Sanity slug: "${result.matchedSlug}"`);
          }
          if (result.diagnostics) {
            console.log(
              `   Normalized URL: ${result.diagnostics.normalizedUrl}`,
            );
            console.log(
              `   Path after prefix: ${result.diagnostics.pathAfterPrefix}`,
            );
            console.log(
              `   Configured prefix: ${result.diagnostics.configuredPrefix ?? "(none)"}`,
            );
            console.log(
              `   Available Sanity slugs: ${result.diagnostics.availableSlugsCount}`,
            );
            if (result.diagnostics.similarSlugs?.length) {
              console.log(`   Similar slugs in Sanity:`);
              for (const similar of result.diagnostics.similarSlugs) {
                console.log(`      - ${similar}`);
              }
            }
          }
        }
      }

      // Check index status if requested
      if (options.checkIndex && matched.length > 0) {
        console.log(`\nChecking index status for ${matched.length} pages...`);
        t = timer.start();
        const matchedUrls = matched.map((m) => m.gscUrl);
        const indexResult = await syncEngine.syncIndexStatus(
          options.site,
          matchedUrls,
        );
        timer.end("Index status check", t);
        console.log(
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
            days: parseInt(options.quietPeriod),
          },
        );
        timer.end("Decay detection", t);

        console.log(`Detected ${signals.length} decay signals`);

        if (options.dryRun) {
          console.log("\nWould create the following tasks:");
          signals.forEach((s) => {
            console.log(`   [${s.severity.toUpperCase()}] ${s.page}`);
            console.log(`      Reason: ${s.reason}`);
            console.log(
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
          console.log(`Created ${created} new refresh tasks`);
        }
      }

      if (!options.dryRun) {
        t = timer.start();
        await syncEngine.writeSnapshots(siteId, matched);
        timer.end("Write Sanity snapshots", t);
        console.log(`Updated Sanity snapshots`);
      }

      timer.end("Total sync", syncStartTime);
      console.log(`\nSync complete!`);
    } catch (error) {
      console.error("Sync failed:", error);
      process.exit(1);
    } finally {
      await sql.end();
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
