#!/usr/bin/env node
import { createRequire } from "module";
import { program } from "commander";
import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { syncCommand } from "./commands/sync.js";
import { listSitesCommand } from "./commands/list-sites.js";
import { diagnoseCommand } from "./commands/diagnose.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

program
  .name("pagebridge")
  .description("PageBridge - Connect Google Search Console to Sanity CMS")
  .version(version)
  .hook("preAction", () => {
    // Load .env.local first (higher priority), then .env
    // Deferred to preAction so --help and --version don't trigger env loading
    const { config } = require("dotenv") as typeof import("dotenv");
    config({ path: ".env.local" });
    config({ path: ".env" });
  });

program.addCommand(initCommand);
program.addCommand(doctorCommand);
program.addCommand(syncCommand);
program.addCommand(listSitesCommand);
program.addCommand(diagnoseCommand);

program.parse();
