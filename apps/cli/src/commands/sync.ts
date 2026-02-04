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
} from "@content-keep/core";
import { createDbWithClient } from "@content-keep/db";

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export const syncCommand = new Command("sync")
  .description("Sync GSC data and generate refresh tasks")
  .requiredOption("--site <url>", "GSC site URL (e.g., sc-domain:example.com)")
  .option("--dry-run", "Preview changes without writing to Sanity")
  .option("--skip-tasks", "Only sync data, do not generate tasks")
  .option("--check-index", "Check Google index status for matched pages")
  .option("--quiet-period <days>", "Ignore pages published within N days", "45")
  .action(async (options) => {
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
        console.error(`❌ Missing required environment variable: ${envVar}`);
        process.exit(1);
      }
    }

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

    const syncEngine = new SyncEngine({ gsc, db, sanity });
    const matcher = new URLMatcher(sanity, {
      contentTypes: ["post", "page"],
      slugField: "slug",
      baseUrl: process.env.SITE_URL!,
      pathPrefix: "/blog",
    });

    console.log(`Starting sync for ${options.site}...`);

    // Find or create the gscSite document in Sanity
    let siteDoc = await sanity.fetch<{ _id: string } | null>(
      `*[_type == "gscSite" && siteUrl == $siteUrl][0]{ _id }`,
      { siteUrl: options.site },
    );

    if (!siteDoc) {
      console.log(`📝 Creating gscSite document for ${options.site}...`);
      siteDoc = await sanity.create({
        _type: "gscSite",
        siteUrl: options.site,
        enabled: true,
      });
    }

    const siteId = siteDoc._id;

    try {
      const { pages, rowsProcessed } = await syncEngine.sync({
        siteUrl: options.site,
        startDate: daysAgo(90),
        endDate: daysAgo(3),
      });

      console.log(`Processed ${rowsProcessed} rows for ${pages.length} pages`);

      const matches = await matcher.matchUrls(pages);
      const matched = matches.filter(
        (m): m is MatchResult & { sanityId: string } => !!m.sanityId,
      );
      const unmatched = matches.filter((m) => !m.sanityId);

      console.log(
        `Matched ${matched.length}/${pages.length} URLs to Sanity documents`,
      );

      if (unmatched.length > 0 && unmatched.length <= 10) {
        console.log(`Unmatched URLs:`);
        unmatched.forEach((u) => console.log(`   - ${u.gscUrl}`));
      }

      // Check index status if requested
      if (options.checkIndex && matched.length > 0) {
        console.log(`\n🔎 Checking index status for ${matched.length} pages...`);
        const matchedUrls = matched.map((m) => m.gscUrl);
        const indexResult = await syncEngine.syncIndexStatus(
          options.site,
          matchedUrls,
        );
        console.log(
          `   ✓ Indexed: ${indexResult.indexed}, Not indexed: ${indexResult.notIndexed}, Skipped: ${indexResult.skipped}`,
        );
      }

      if (!options.skipTasks) {
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

        console.log(`🔍 Detected ${signals.length} decay signals`);

        if (options.dryRun) {
          console.log("\nWould create the following tasks:");
          signals.forEach((s) => {
            console.log(`   [${s.severity.toUpperCase()}] ${s.page}`);
            console.log(`      Reason: ${s.reason}`);
            console.log(
              `      Position: ${s.metrics.positionBefore} → ${s.metrics.positionNow}`,
            );
          });
        } else {
          const taskGenerator = new TaskGenerator(sanity);
          const created = await taskGenerator.createTasks(
            siteId,
            signals,
            matches,
          );
          console.log(`✅ Created ${created} new refresh tasks`);
        }
      }

      if (!options.dryRun) {
        await syncEngine.writeSnapshots(siteId, matched);
        console.log(`Updated Sanity snapshots`);
      }

      console.log(`\n✨ Sync complete!`);
    } catch (error) {
      console.error("❌ Sync failed:", error);
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
