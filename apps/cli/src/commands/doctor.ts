import { Command } from "commander";
import { createClient as createSanityClient } from "@sanity/client";
import { GSCClient } from "@pagebridge/core";
import {
  createDb,
  sql,
  searchAnalytics,
  queryAnalytics,
  syncLog,
  pageIndexStatus,
  unmatchDiagnostics,
} from "@pagebridge/db";
import { resolve } from "../resolve-config.js";
import { log } from "../logger.js";
import { existsSync, readFileSync } from "fs";
import { resolve as resolvePath } from "path";

const ENV_FILES = [".env.local", ".env"] as const;

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  details?: string;
}

function loadEnvFile(filePath: string): void {
  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Don't overwrite existing env vars
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function checkEnvFile(): Promise<CheckResult> {
  for (const name of ENV_FILES) {
    const envPath = resolvePath(process.cwd(), name);
    if (existsSync(envPath)) {
      loadEnvFile(envPath);
      return {
        name: "Environment File",
        status: "pass",
        message: `${name} file found and loaded`,
      };
    }
  }
  return {
    name: "Environment File",
    status: "fail",
    message: "No .env file found",
    details:
      "Run 'pagebridge init' to create one (looks for .env.local, .env)",
  };
}

async function checkEnvVars(): Promise<CheckResult> {
  const required = [
    "GOOGLE_SERVICE_ACCOUNT",
    "DATABASE_URL",
    "SANITY_PROJECT_ID",
    "SANITY_DATASET",
    "SANITY_TOKEN",
    "SITE_URL",
  ];

  const missing = required.filter(
    (key) => !process.env[`PAGEBRIDGE_${key}`] && !process.env[key],
  );

  if (missing.length > 0) {
    return {
      name: "Environment Variables",
      status: "fail",
      message: `Missing ${missing.length} required variables`,
      details: `Missing: ${missing.map((k) => `PAGEBRIDGE_${k}`).join(", ")}`,
    };
  }

  return {
    name: "Environment Variables",
    status: "pass",
    message: "All required variables are set",
  };
}

async function checkDatabase(): Promise<CheckResult> {
  const dbUrl = resolve(undefined, "DATABASE_URL");
  if (!dbUrl) {
    return {
      name: "Database Connection",
      status: "skip",
      message: "DATABASE_URL not set",
    };
  }

  try {
    const { db, close } = createDb(dbUrl);
    await db.execute(sql`SELECT 1`);
    await close();
    return {
      name: "Database Connection",
      status: "pass",
      message: "Connected successfully",
    };
  } catch (error) {
    return {
      name: "Database Connection",
      status: "fail",
      message: "Connection failed",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkDatabaseSchema(): Promise<CheckResult> {
  const dbUrl = resolve(undefined, "DATABASE_URL");
  if (!dbUrl) {
    return {
      name: "Database Schema",
      status: "skip",
      message: "DATABASE_URL not set",
    };
  }

  try {
    const { db, close } = createDb(dbUrl);

    // Check if tables exist by trying to query them
    const tables = [
      { name: "search_analytics", table: searchAnalytics },
      { name: "query_analytics", table: queryAnalytics },
      { name: "sync_log", table: syncLog },
      { name: "page_index_status", table: pageIndexStatus },
      { name: "unmatch_diagnostics", table: unmatchDiagnostics },
    ];

    const missingTables: string[] = [];

    for (const { name, table } of tables) {
      try {
        await db.select().from(table).limit(1);
      } catch {
        missingTables.push(name);
      }
    }

    await close();

    if (missingTables.length > 0) {
      return {
        name: "Database Schema",
        status: "fail",
        message: `Missing ${missingTables.length} tables`,
        details: `Run 'pnpm db:push' or 'pagebridge sync --migrate'. Missing: ${missingTables.join(", ")}`,
      };
    }

    return {
      name: "Database Schema",
      status: "pass",
      message: "All tables exist",
    };
  } catch (error) {
    return {
      name: "Database Schema",
      status: "fail",
      message: "Schema check failed",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkSanity(): Promise<CheckResult> {
  const projectId = resolve(undefined, "SANITY_PROJECT_ID");
  const dataset = resolve(undefined, "SANITY_DATASET");
  const token = resolve(undefined, "SANITY_TOKEN");

  if (!projectId || !dataset || !token) {
    return {
      name: "Sanity Connection",
      status: "skip",
      message: "Sanity credentials not set",
    };
  }

  try {
    const sanity = createSanityClient({
      projectId,
      dataset,
      token,
      apiVersion: "2024-01-01",
      useCdn: false,
    });

    await sanity.fetch('*[_type == "gscSite"][0]{ _id }');

    return {
      name: "Sanity Connection",
      status: "pass",
      message: "Connected successfully",
    };
  } catch (error) {
    return {
      name: "Sanity Connection",
      status: "fail",
      message: "Connection failed",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkGoogleServiceAccount(): Promise<CheckResult> {
  const serviceAccount = resolve(undefined, "GOOGLE_SERVICE_ACCOUNT");
  if (!serviceAccount) {
    return {
      name: "Google Service Account",
      status: "skip",
      message: "GOOGLE_SERVICE_ACCOUNT not set",
    };
  }

  try {
    const credentials = JSON.parse(serviceAccount);
    if (!credentials.private_key || !credentials.client_email) {
      return {
        name: "Google Service Account",
        status: "fail",
        message: "Invalid service account format",
        details: "Missing private_key or client_email",
      };
    }

    return {
      name: "Google Service Account",
      status: "pass",
      message: `Valid (${credentials.client_email})`,
    };
  } catch {
    return {
      name: "Google Service Account",
      status: "fail",
      message: "Invalid JSON",
      details: "Service account must be valid JSON",
    };
  }
}

async function checkGSCAccess(): Promise<CheckResult> {
  const serviceAccount = resolve(undefined, "GOOGLE_SERVICE_ACCOUNT");
  if (!serviceAccount) {
    return {
      name: "GSC API Access",
      status: "skip",
      message: "Service account not configured",
    };
  }

  try {
    const credentials = JSON.parse(serviceAccount);
    const gsc = new GSCClient({ credentials });
    const sites = await gsc.listSites();

    if (sites.length === 0) {
      return {
        name: "GSC API Access",
        status: "warn",
        message: "No sites found",
        details:
          "Make sure the service account has access to your Search Console properties",
      };
    }

    return {
      name: "GSC API Access",
      status: "pass",
      message: `Found ${sites.length} site${sites.length > 1 ? "s" : ""}`,
    };
  } catch (error) {
    return {
      name: "GSC API Access",
      status: "fail",
      message: "API access failed",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkNodeVersion(): Promise<CheckResult> {
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0] ?? "0");

  if (major < 18) {
    return {
      name: "Node.js Version",
      status: "fail",
      message: `Node.js ${version} is too old`,
      details: "PageBridge requires Node.js 18 or higher",
    };
  }

  return {
    name: "Node.js Version",
    status: "pass",
    message: `Node.js ${version}`,
  };
}

function getStatusIcon(status: CheckResult["status"]): string {
  switch (status) {
    case "pass":
      return "✅";
    case "fail":
      return "❌";
    case "warn":
      return "⚠️";
    case "skip":
      return "⏭️";
  }
}

export const doctorCommand = new Command("doctor")
  .description("Diagnose PageBridge setup and configuration issues")
  .option("--verbose", "Show detailed information")
  .action(async (options) => {
    log.info("🏥 PageBridge Health Check\n");

    const checks: Array<() => Promise<CheckResult>> = [
      checkNodeVersion,
      checkEnvFile,
      checkEnvVars,
      checkDatabase,
      checkDatabaseSchema,
      checkSanity,
      checkGoogleServiceAccount,
      checkGSCAccess,
    ];

    const results: CheckResult[] = [];

    for (const check of checks) {
      try {
        const result = await check();
        results.push(result);

        const icon = getStatusIcon(result.status);
        log.info(`${icon} ${result.name}: ${result.message}`);

        if (options.verbose && result.details) {
          log.info(`   ${result.details}`);
        } else if (
          !options.verbose &&
          result.status === "fail" &&
          result.details
        ) {
          log.info(`   ${result.details}`);
        }
      } catch (error) {
        results.push({
          name: "Unknown Check",
          status: "fail",
          message: "Check failed",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Summary
    const passed = results.filter((r) => r.status === "pass").length;
    const failed = results.filter((r) => r.status === "fail").length;
    const warned = results.filter((r) => r.status === "warn").length;
    const skipped = results.filter((r) => r.status === "skip").length;

    log.info("\n📊 Summary:");
    log.info(`   ✅ Passed: ${passed}`);
    if (failed > 0) log.error(`   ❌ Failed: ${failed}`);
    if (warned > 0) log.warn(`   ⚠️  Warnings: ${warned}`);
    if (skipped > 0) log.info(`   ⏭️  Skipped: ${skipped}`);

    if (failed === 0 && warned === 0) {
      log.info("\n🎉 All checks passed! PageBridge is ready to use.");
      log.info(
        "Run 'pagebridge sync --site <url> --migrate' to start syncing.",
      );
    } else if (failed > 0) {
      log.error(
        "\n⚠️  Some checks failed. Fix the issues above and run 'pagebridge doctor' again.",
      );
    } else {
      log.warn(
        "\n⚠️  Some warnings detected. PageBridge may still work, but review the warnings above.",
      );
    }

    process.exit(failed > 0 ? 1 : 0);
  });
