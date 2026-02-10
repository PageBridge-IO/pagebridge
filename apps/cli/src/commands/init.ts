import { Command } from "commander";
import { createClient as createSanityClient } from "@sanity/client";
import { GSCClient } from "@pagebridge/core";
import { createDb, sql } from "@pagebridge/db";
import { log } from "../logger.js";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { resolve as resolvePath } from "path";
import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

const rl = readline.createInterface({ input, output });

const ENV_FILES = [".env.local", ".env"] as const;

async function prompt(
  question: string,
  defaultValue?: string,
): Promise<string> {
  const displayQuestion = defaultValue
    ? `${question} (${defaultValue}): `
    : `${question}: `;
  const answer = await rl.question(displayQuestion);
  return answer.trim() || defaultValue || "";
}

async function confirmPrompt(
  question: string,
  defaultYes = true,
): Promise<boolean> {
  const suffix = defaultYes ? " (Y/n): " : " (y/N): ";
  const answer = await rl.question(question + suffix);
  const normalized = answer.trim().toLowerCase();

  if (!normalized) return defaultYes;
  return normalized === "y" || normalized === "yes";
}

/**
 * Parse an existing env file and return a Set of PAGEBRIDGE_ keys that are
 * already defined (stored WITHOUT the prefix, e.g. "DATABASE_URL").
 */
function parseExistingKeys(filePath: string): Set<string> {
  const keys = new Set<string>();
  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (key.startsWith("PAGEBRIDGE_")) {
      keys.add(key.replace("PAGEBRIDGE_", ""));
    }
  }
  return keys;
}

/**
 * Find the first existing env file matching ENV_FILES, or return null.
 */
function findEnvFile(): { name: string; path: string } | null {
  for (const name of ENV_FILES) {
    const fullPath = resolvePath(process.cwd(), name);
    if (existsSync(fullPath)) {
      return { name, path: fullPath };
    }
  }
  return null;
}

export const initCommand = new Command("init")
  .description("Interactive setup wizard for PageBridge")
  .option("--skip-db-check", "Skip database connection test")
  .option("--skip-sanity-check", "Skip Sanity API test")
  .option("--skip-gsc-check", "Skip Google Search Console API test")
  .action(async (options) => {
    log.info("🚀 PageBridge Interactive Setup\n");

    // Detect existing env file (same order as doctor command)
    const existing = findEnvFile();
    const envPath = existing?.path ?? resolvePath(process.cwd(), ".env");
    const envFileName = existing?.name ?? ".env";
    const existingKeys = existing
      ? parseExistingKeys(existing.path)
      : new Set<string>();
    const isAppend = existing !== null;

    if (isAppend) {
      const skippedCount = existingKeys.size;
      if (skippedCount > 0) {
        log.info(
          `Found ${envFileName} with ${skippedCount} existing PAGEBRIDGE_ variable${skippedCount > 1 ? "s" : ""}. Only missing variables will be configured.\n`,
        );
      } else {
        log.info(`Found ${envFileName}. New variables will be appended.\n`);
      }
    }

    log.info("Let's configure your environment variables.\n");

    // Collect new env lines to write
    const newLines: string[] = [];

    // Database URL
    let dbUrl: string | undefined;
    if (existingKeys.has("DATABASE_URL")) {
      log.info("📦 Database Configuration — already set, skipping");
    } else {
      log.info("📦 Database Configuration");
      dbUrl = await prompt(
        "PostgreSQL connection string",
        "postgresql://postgres:postgres@localhost:5432/gsc_sanity",
      );
      newLines.push(
        "# PostgreSQL connection string",
        `PAGEBRIDGE_DATABASE_URL='${dbUrl}'`,
        "",
      );

      if (!options.skipDbCheck && dbUrl) {
        try {
          log.info("Testing database connection...");
          const { db, close } = createDb(dbUrl);
          await db.execute(sql`SELECT 1`);
          await close();
          log.info("✅ Database connection successful\n");
        } catch (error) {
          log.error(
            `❌ Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          log.warn(
            "You can continue anyway, but you'll need to fix this before syncing.\n",
          );
        }
      }
    }

    // Sanity Configuration
    let sanityProjectId: string | undefined;
    let sanityDataset: string | undefined;
    let sanityToken: string | undefined;

    const sanityKeys = ["SANITY_PROJECT_ID", "SANITY_DATASET", "SANITY_TOKEN"];
    const missingSanity = sanityKeys.filter((k) => !existingKeys.has(k));

    if (missingSanity.length === 0) {
      log.info("🎨 Sanity Configuration — already set, skipping");
    } else {
      log.info("🎨 Sanity Configuration");
      if (!existingKeys.has("SANITY_PROJECT_ID")) {
        sanityProjectId = await prompt("Sanity Project ID");
        newLines.push(`PAGEBRIDGE_SANITY_PROJECT_ID='${sanityProjectId}'`);
      }
      if (!existingKeys.has("SANITY_DATASET")) {
        sanityDataset = await prompt("Sanity Dataset", "production");
        newLines.push(`PAGEBRIDGE_SANITY_DATASET='${sanityDataset}'`);
      }
      if (!existingKeys.has("SANITY_TOKEN")) {
        sanityToken = await prompt(
          "Sanity API Token (with Editor permissions)",
        );
        newLines.push(`PAGEBRIDGE_SANITY_TOKEN='${sanityToken}'`);
      }
      newLines.push("");

      if (
        !options.skipSanityCheck &&
        (sanityProjectId || existingKeys.has("SANITY_PROJECT_ID")) &&
        (sanityToken || existingKeys.has("SANITY_TOKEN"))
      ) {
        try {
          log.info("Testing Sanity API connection...");
          const sanity = createSanityClient({
            projectId:
              sanityProjectId ??
              process.env.PAGEBRIDGE_SANITY_PROJECT_ID ??
              process.env.SANITY_PROJECT_ID ??
              "",
            dataset:
              sanityDataset ??
              process.env.PAGEBRIDGE_SANITY_DATASET ??
              process.env.SANITY_DATASET ??
              "production",
            token:
              sanityToken ??
              process.env.PAGEBRIDGE_SANITY_TOKEN ??
              process.env.SANITY_TOKEN ??
              "",
            apiVersion: "2024-01-01",
            useCdn: false,
          });
          await sanity.fetch('*[_type == "gscSite"][0]{ _id }');
          log.info("✅ Sanity connection successful\n");
        } catch (error) {
          log.error(
            `❌ Sanity connection failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          log.warn("Check your project ID, dataset, and token permissions.\n");
        }
      }
    }

    // Google Service Account
    let credentials: { client_email: string; private_key: string } | null =
      null;
    let googleServiceAccount: string | undefined;

    if (existingKeys.has("GOOGLE_SERVICE_ACCOUNT")) {
      log.info(
        "🔐 Google Search Console Configuration — already set, skipping",
      );
    } else {
      log.info("🔐 Google Search Console Configuration");
      log.info(
        "You need a Google Cloud service account with Search Console API access.",
      );
      log.info(
        'Paste the entire service account JSON (it should start with {"type":"service_account"...):\n',
      );

      googleServiceAccount = await prompt("Google Service Account JSON");
      newLines.push(
        "# Google Service Account JSON (stringified)",
        `PAGEBRIDGE_GOOGLE_SERVICE_ACCOUNT='${googleServiceAccount}'`,
        "",
      );

      // Validate JSON
      try {
        credentials = JSON.parse(googleServiceAccount);

        if (!credentials) {
          throw new Error("Parsed credentials is null");
        }

        log.info(
          `✅ Valid JSON for service account: ${credentials.client_email}\n`,
        );
      } catch {
        log.error("❌ Invalid JSON format for service account");
        log.warn("You'll need to fix this in .env before syncing.\n");
      }

      // Test GSC API
      if (!options.skipGscCheck && credentials) {
        try {
          log.info("Testing Google Search Console API access...");
          const gsc = new GSCClient({ credentials });
          const sites = await gsc.listSites();
          log.info(
            `✅ GSC API access successful. Found ${sites.length} sites:`,
          );
          sites.forEach((site) => log.info(`   - ${site}`));
          log.info("");
        } catch (error) {
          log.error(
            `❌ GSC API access failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          log.warn(
            "Make sure the service account has access to your Search Console properties.\n",
          );
        }
      }
    }

    // Site URL
    let siteUrl: string | undefined;
    if (existingKeys.has("SITE_URL")) {
      log.info("🌐 Site Configuration — already set, skipping");
    } else {
      log.info("🌐 Site Configuration");
      siteUrl = await prompt(
        "Your website base URL (e.g., https://example.com)",
      );
      newLines.push("# Your site URL", `PAGEBRIDGE_SITE_URL='${siteUrl}'`, "");
    }

    // Write env file
    if (newLines.length === 0) {
      log.info("\n✅ All PAGEBRIDGE_ variables are already configured!\n");
    } else if (isAppend) {
      const block = [
        "",
        `# PageBridge variables appended by 'pagebridge init' on ${new Date().toISOString()}`,
        ...newLines,
      ].join("\n");
      appendFileSync(envPath, block, "utf-8");
      log.info(`✅ Variables appended to ${envFileName}!\n`);
    } else {
      const envContent = `# PageBridge Environment Variables
# Generated by 'pagebridge init' on ${new Date().toISOString()}
# Uses PAGEBRIDGE_ prefix to avoid conflicts with your project's env vars.

${newLines.join("\n")}
`;
      writeFileSync(envPath, envContent, "utf-8");
      log.info("✅ .env file created successfully!\n");
    }

    // Offer to run migrations
    const resolvedDbUrl =
      dbUrl ?? process.env.PAGEBRIDGE_DATABASE_URL ?? process.env.DATABASE_URL;
    const runMigrations = await confirmPrompt(
      "Would you like to run database migrations now?",
      true,
    );

    if (runMigrations && resolvedDbUrl) {
      log.info("Running database migrations...");
      try {
        // Import migrate function
        const { migrateIfRequested } = await import("../migrate.js");
        await migrateIfRequested(true, resolvedDbUrl);
        log.info("✅ Migrations completed\n");
      } catch (error) {
        log.error(
          `❌ Migration failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
    }

    // Offer to run first sync
    if (credentials) {
      const runSync = await confirmPrompt(
        "Would you like to run your first sync now?",
        false,
      );

      if (runSync) {
        const sites = await new GSCClient({ credentials }).listSites();
        if (sites.length === 0) {
          log.warn("No sites found in your Search Console account.");
        } else if (sites.length === 1) {
          log.info(`\nUsing site: ${sites[0]}`);
          // Note: You'd import and call the sync command here
          log.info(`Run: pagebridge sync --site "${sites[0]}" --migrate`);
        } else {
          log.info("\nAvailable sites:");
          sites.forEach((site, i) => log.info(`  ${i + 1}. ${site}`));
          const siteChoice = await prompt("\nEnter site number or full URL");
          const selectedSite = sites[parseInt(siteChoice) - 1] || siteChoice;
          log.info(`\nRun: pagebridge sync --site "${selectedSite}" --migrate`);
        }
      }
    }

    log.info("\n🎉 Setup complete!");
    log.info("\nNext steps:");
    log.info(`  1. Review your ${envFileName} file`);
    log.info("  2. Run: pagebridge sync --site <your-site-url> --migrate");
    log.info("  3. Open Sanity Studio to see your performance data\n");

    rl.close();
  });
