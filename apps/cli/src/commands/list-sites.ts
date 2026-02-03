import { Command } from "commander";
import { GSCClient } from "@gsc-sanity/core";

export const listSitesCommand = new Command("list-sites")
  .description("List all sites the service account has access to")
  .action(async () => {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
      console.error("❌ Missing GOOGLE_SERVICE_ACCOUNT environment variable");
      process.exit(1);
    }

    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    } catch {
      console.error("❌ Failed to parse GOOGLE_SERVICE_ACCOUNT as JSON");
      process.exit(1);
    }

    console.log(`🔑 Using service account: ${credentials.client_email}`);

    const gsc = new GSCClient({ credentials });

    try {
      const sites = await gsc.listSites();

      if (sites.length === 0) {
        console.log(
          "\n⚠️  No sites found. The service account has no access to any GSC properties.",
        );
        console.log("\nTo fix this:");
        console.log(
          "1. Go to Google Search Console → Settings → Users and permissions",
        );
        console.log(`2. Add user: ${credentials.client_email}`);
        console.log("3. Set permission level to 'Full'");
      } else {
        console.log(`\n✅ Found ${sites.length} site(s):\n`);
        sites.forEach((site) => console.log(`   ${site}`));
        console.log(
          '\nUse one of these exact values with: pnpm sync --site "<value>"',
        );
      }
    } catch (error) {
      console.error("❌ Failed to list sites:", error);
    }
  });
