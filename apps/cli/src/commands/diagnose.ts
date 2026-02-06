import { Command } from "commander";
import postgres from "postgres";
import {
  createDbWithClient,
  unmatchDiagnostics,
  eq,
  desc,
} from "@pagebridge/db";

export const diagnoseCommand = new Command("diagnose")
  .description("View diagnostics for unmatched URLs")
  .requiredOption("--site <url>", "GSC site URL (e.g., sc-domain:example.com)")
  .option("--reason <reason>", "Filter by unmatch reason")
  .option("--limit <n>", "Limit number of results", "20")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    if (!process.env.DATABASE_URL) {
      console.error("Missing required environment variable: DATABASE_URL");
      process.exit(1);
    }

    const sql = postgres(process.env.DATABASE_URL);
    const db = createDbWithClient(sql);

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
        console.log(`No unmatched URLs found for ${options.site}`);
        console.log(
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

      console.log(`\nUnmatched URL Diagnostics for ${options.site}\n`);
      console.log(`Total: ${results.length} unmatched URLs\n`);

      for (const [reason, items] of byReason) {
        console.log(
          `${getReasonEmoji(reason)} ${getReasonDescription(reason)} (${items.length}):`,
        );
        console.log();

        for (const item of items) {
          console.log(`  ${item.gscUrl}`);
          if (item.extractedSlug) {
            console.log(`    Extracted slug: "${item.extractedSlug}"`);
          }
          if (item.similarSlugs) {
            try {
              const similar = JSON.parse(item.similarSlugs) as string[];
              if (similar.length > 0) {
                console.log(`    Similar slugs in Sanity:`);
                for (const s of similar) {
                  console.log(`      - ${s}`);
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
          console.log();
        }
      }

      console.log(`\nTo fix unmatched URLs:`);
      console.log(
        `  1. Check if the Sanity document exists with the correct slug`,
      );
      console.log(`  2. Verify the document type is in the contentTypes list`);
      console.log(`  3. Ensure the slug field name matches your configuration`);
      console.log(
        `  4. If using a path prefix, verify it matches your URL structure`,
      );
    } finally {
      await sql.end();
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
