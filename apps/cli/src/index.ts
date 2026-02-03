#!/usr/bin/env node
import "dotenv/config";
import { program } from "commander";
import { syncCommand } from "./commands/sync.js";

program
  .name("gsc-sanity")
  .description(
    "GSC Sanity Connector CLI - Sync Google Search Console data to Sanity",
  )
  .version("0.0.1");

program.addCommand(syncCommand);

program.parse();
