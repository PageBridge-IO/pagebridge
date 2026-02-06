#!/usr/bin/env node
import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// Load .env from monorepo root
config({ path: resolve(__dirname, "../../../.env") });

import { program } from "commander";
import { syncCommand } from "./commands/sync.js";
import { listSitesCommand } from "./commands/list-sites.js";
import { diagnoseCommand } from "./commands/diagnose.js";

program
  .name("pagebridge")
  .description(
    "PageBridge - Connect Google Search Console to Sanity CMS",
  )
  .version("0.0.1");

program.addCommand(syncCommand);
program.addCommand(listSitesCommand);
program.addCommand(diagnoseCommand);

program.parse();
