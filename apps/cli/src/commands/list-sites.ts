import { Command } from "commander";
import { GSCClient } from "@pagebridge/core";
import { resolve, requireConfig } from "../resolve-config.js";
import { log } from "../logger.js";

export const listSitesCommand = new Command("list-sites")
  .description("List all sites the service account has access to")
  .option("--google-service-account <json>", "Google service account JSON")
  .action(async (options) => {
    const googleServiceAccount = resolve(options.googleServiceAccount, "GOOGLE_SERVICE_ACCOUNT");

    requireConfig([
      { name: "GOOGLE_SERVICE_ACCOUNT", flag: "--google-service-account <json>", envVar: "GOOGLE_SERVICE_ACCOUNT", value: googleServiceAccount },
    ]);

    let credentials;
    try {
      credentials = JSON.parse(googleServiceAccount!);
    } catch {
      log.error("Failed to parse GOOGLE_SERVICE_ACCOUNT as JSON");
      process.exit(1);
    }

    log.info(`Using service account: ${credentials.client_email}`);

    const gsc = new GSCClient({ credentials });

    try {
      const sites = await gsc.listSites();

      if (sites.length === 0) {
        log.warn("No sites found. The service account has no access to any GSC properties.");
        log.info("\nTo fix this:");
        log.info(
          "1. Go to Google Search Console > Settings > Users and permissions",
        );
        log.info(`2. Add user: ${credentials.client_email}`);
        log.info("3. Set permission level to 'Full'");
      } else {
        log.info(`Found ${sites.length} site(s):\n`);
        sites.forEach((site) => log.info(`   ${site}`));
        log.info(
          '\nUse one of these exact values with: pnpm sync --site "<value>"',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to list sites: ${message}`);
      process.exit(1);
    }
  });
