import { Command } from "commander";
import { createClient as createSanityClient } from "@sanity/client";
import { GSCClient } from "@pagebridge/core";
import { createDb, sql } from "@pagebridge/db";
import { log } from "../logger.js";
import { existsSync, writeFileSync } from "fs";
import { resolve as resolvePath } from "path";
import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

const rl = readline.createInterface({ input, output });

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

export const initCommand = new Command("init")
  .description("Interactive setup wizard for PageBridge")
  .option("--skip-db-check", "Skip database connection test")
  .option("--skip-sanity-check", "Skip Sanity API test")
  .option("--skip-gsc-check", "Skip Google Search Console API test")
  .action(async (options) => {
    log.info("🚀 PageBridge Interactive Setup\n");

    const envPath = resolvePath(process.cwd(), ".env");

    // Check if .env already exists
    if (existsSync(envPath)) {
      const overwrite = await confirmPrompt(
        ".env file already exists. Do you want to overwrite it?",
        false,
      );
      if (!overwrite) {
        log.info("Skipping .env creation. Exiting...");
        rl.close();
        return;
      }
    }

    log.info("Let's configure your environment variables.\n");

    // Database URL
    log.info("📦 Database Configuration");
    const dbUrl = await prompt(
      "PostgreSQL connection string",
      "postgresql://postgres:postgres@localhost:5432/gsc_sanity",
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

    // Sanity Configuration
    log.info("🎨 Sanity Configuration");
    const sanityProjectId = await prompt("Sanity Project ID");
    const sanityDataset = await prompt("Sanity Dataset", "production");
    const sanityToken = await prompt(
      "Sanity API Token (with Editor permissions)",
    );

    if (!options.skipSanityCheck && sanityProjectId && sanityToken) {
      try {
        log.info("Testing Sanity API connection...");
        const sanity = createSanityClient({
          projectId: sanityProjectId,
          dataset: sanityDataset,
          token: sanityToken,
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

    // Google Service Account
    log.info("🔐 Google Search Console Configuration");
    log.info(
      "You need a Google Cloud service account with Search Console API access.",
    );
    log.info(
      'Paste the entire service account JSON (it should start with {"type":"service_account"...):\n',
    );

    const googleServiceAccount = await prompt("Google Service Account JSON");

    // Validate JSON
    let credentials: { client_email: string; private_key: string } | null =
      null;
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
        log.info(`✅ GSC API access successful. Found ${sites.length} sites:`);
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

    // Site URL
    log.info("🌐 Site Configuration");
    const siteUrl = await prompt(
      "Your website base URL (e.g., https://example.com)",
    );

    // Write .env file
    const envContent = `# PageBridge Environment Variables
# Generated by 'pagebridge init' on ${new Date().toISOString()}
# Uses PAGEBRIDGE_ prefix to avoid conflicts with your project's env vars.

# Google Service Account JSON (stringified)
PAGEBRIDGE_GOOGLE_SERVICE_ACCOUNT='${googleServiceAccount}'

# PostgreSQL connection string
PAGEBRIDGE_DATABASE_URL='${dbUrl}'

# Sanity Studio configuration
PAGEBRIDGE_SANITY_PROJECT_ID='${sanityProjectId}'
PAGEBRIDGE_SANITY_DATASET='${sanityDataset}'
PAGEBRIDGE_SANITY_TOKEN='${sanityToken}'

# Your site URL
PAGEBRIDGE_SITE_URL='${siteUrl}'
`;

    writeFileSync(envPath, envContent, "utf-8");
    log.info("✅ .env file created successfully!\n");

    // Offer to run migrations
    const runMigrations = await confirmPrompt(
      "Would you like to run database migrations now?",
      true,
    );

    if (runMigrations && dbUrl) {
      log.info("Running database migrations...");
      try {
        // Import migrate function
        const { migrateIfRequested } = await import("../migrate.js");
        await migrateIfRequested(true, dbUrl);
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
    log.info("  1. Review your .env file");
    log.info("  2. Run: pagebridge sync --site <your-site-url> --migrate");
    log.info("  3. Open Sanity Studio to see your performance data\n");

    rl.close();
  });
