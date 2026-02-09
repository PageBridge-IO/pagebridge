#!/usr/bin/env node
import { program } from "commander";
import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { syncCommand } from "./commands/sync.js";
import { listSitesCommand } from "./commands/list-sites.js";
import { diagnoseCommand } from "./commands/diagnose.js";

program
  .name("pagebridge")
  .description("PageBridge - Connect Google Search Console to Sanity CMS")
  .version("0.0.2");

program.addCommand(initCommand);
program.addCommand(doctorCommand);
program.addCommand(syncCommand);
program.addCommand(listSitesCommand);
program.addCommand(diagnoseCommand);

program.parse();
