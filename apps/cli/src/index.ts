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

program
  .name("gsc-sanity")
  .description(
    "GSC Sanity Connector CLI - Sync Google Search Console data to Sanity",
  )
  .version("0.0.1");

program.addCommand(syncCommand);
program.addCommand(listSitesCommand);

program.parse();
