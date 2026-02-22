# Architecture

**Analysis Date:** 2026-02-22

## Pattern Overview

**Overall:** Multi-layer event-driven architecture with clear separation between data ingestion, analysis, and output layers. The system follows a data pipeline pattern: fetch GSC data → store in PostgreSQL → analyze for insights → write to Sanity CMS.

**Key Characteristics:**
- Orchestrated data flow through specialized analyzer modules
- Pluggable architecture (Sanity plugin, CLI, core library)
- Asynchronous batch processing with progress callbacks
- Transaction-based mutations for consistency
- Caching strategies for expensive operations (index status checks)

## Layers

**Data Ingestion Layer:**
- Purpose: Fetch raw metrics from Google Search Console API
- Location: `packages/core/src/gsc-client.ts`
- Contains: GSC API client with JWT authentication, search analytics fetching, index inspection
- Depends on: Google APIs library (`googleapis`)
- Used by: `SyncEngine`

**Storage Layer:**
- Purpose: Persist metrics in PostgreSQL for historical analysis
- Location: `packages/db/src/schema.ts`
- Contains: Drizzle ORM schema (searchAnalytics, queryAnalytics, syncLog, pageIndexStatus, unmatchDiagnostics)
- Depends on: Drizzle ORM, PostgreSQL
- Used by: All analyzers, SyncEngine

**Orchestration Layer:**
- Purpose: Coordinate sync workflow and write final snapshots
- Location: `packages/core/src/sync-engine.ts`
- Contains: SyncEngine class managing data fetch, storage, and Sanity snapshot creation
- Depends on: GSCClient, database, Sanity client
- Used by: CLI `sync` command

**Analysis Layer:**
- Purpose: Process stored metrics to generate insights
- Location: `packages/core/src/*.ts` (multiple analyzer classes)
- Contains:
  - `DecayDetector` - identifies declining content based on configurable rules
  - `QuickWinAnalyzer` - finds page-1 ranking opportunities (position 8-20)
  - `CtrAnomalyAnalyzer` - detects unusual click-through rates vs position baseline
  - `DailyMetricsCollector` - tracks daily metric changes
  - `PublishingImpactAnalyzer` - measures performance after content edits
  - `CannibalizationAnalyzer` - finds competing pages ranking for same queries
  - `SiteInsightAnalyzer` - site-level aggregations (top performers, orphan pages)
- Depends on: Database queries, Drizzle ORM
- Used by: CLI, insight generation workflow

**URL Matching Layer:**
- Purpose: Link GSC URLs to Sanity documents
- Location: `packages/core/src/url-matcher.ts`
- Contains: URLMatcher class supporting multiple content types with per-type URL configs
- Depends on: Sanity client
- Used by: SyncEngine, task generation

**Task Generation Layer:**
- Purpose: Create refresh tasks in Sanity for detected issues
- Location: `packages/core/src/task-generator.ts`
- Contains: TaskGenerator for creating gscRefreshTask documents
- Depends on: Sanity client, database (optional, for query context)
- Used by: CLI sync command

**Output Layer:**
- Purpose: Write processed data to Sanity CMS
- Location: `packages/core/src/sync-engine.ts` (writeSnapshots method)
- Contains: Transaction-based Sanity mutation logic, snapshot creation/updates
- Depends on: Sanity client
- Used by: CLI sync workflow

**CLI Entry Point:**
- Purpose: Command-line interface for users
- Location: `apps/cli/src/index.ts` (entry), `apps/cli/src/commands/*.ts` (commands)
- Contains: Commander.js setup, command definitions (sync, list-sites, init, doctor, diagnose)
- Depends on: All core modules
- Used by: End users, scheduled sync jobs

**Sanity Plugin Layer:**
- Purpose: Studio UI and document type definitions
- Location: `packages/sanity-plugin/src/`
- Contains:
  - Document schemas: `gscSite`, `gscSnapshot`, `gscRefreshTask`, `gscSiteInsight`
  - Dashboard components: overview, opportunities, cannibalization, refresh queue tabs
  - Performance pane: per-document search performance display
- Depends on: Sanity Studio v3, React
- Used by: Content editors in Sanity Studio

## Data Flow

**Sync Flow (CLI → Database → Sanity):**

1. User runs `pagebridge sync --site sc-domain:example.com`
2. CLI loads configuration from environment and `.env` files
3. Creates GSCClient with Google service account credentials
4. Creates SyncEngine with GSC client, database, and Sanity client
5. SyncEngine.sync() fetches data:
   - Queries GSC API with `dimensions=["page", "date"]` for page-level metrics
   - Queries GSC API with `dimensions=["page", "query", "date"]` for query-level metrics
   - Stores results in `search_analytics` and `query_analytics` tables (batched upserts)
   - Logs sync job status in `sync_log` table
6. Creates URLMatcher, DecayDetector, and other analyzers
7. URLMatcher processes matched Sanity documents from GROQ queries
8. Analyzers process stored metrics:
   - DecayDetector identifies declining pages
   - QuickWinAnalyzer finds low-cost ranking improvements
   - CtrAnomalyAnalyzer detects CTR anomalies
   - Other analyzers generate additional insights
9. SyncEngine.writeSnapshots() creates/updates `gscSnapshot` documents in Sanity:
   - Aggregates metrics for last7, last28, last90 periods
   - Attaches insights (quick wins, alerts, daily metrics)
   - Checks and stores index status (cached 24h)
10. TaskGenerator creates `gscRefreshTask` documents for decay signals
11. CLI reports completion and task count

**State Management:**

- **Database**: Source of truth for historical metrics (persisted indefinitely)
- **Sanity**: Read-only source for content metadata, write target for snapshots and tasks
- **Google Search Console**: External read-only API, queried on-demand
- **Cache**: 24-hour index status cache in database to reduce API calls

## Key Abstractions

**SearchAnalyticsRow:**
- Purpose: Represents raw GSC API row with page, query, date, and metrics
- Location: `packages/core/src/gsc-client.ts`
- Pattern: Simple data transfer object between API and storage

**MatchResult:**
- Purpose: Represents outcome of URL-to-document matching
- Location: `packages/core/src/url-matcher.ts`
- Pattern: Contains matched Sanity ID, confidence level, diagnostic info for unmatched URLs

**DecaySignal:**
- Purpose: Represents detected content decay with reason and severity
- Location: `packages/core/src/decay-detector.ts`
- Pattern: Structured signal for task generation and snapshot alerts

**SnapshotInsights:**
- Purpose: Container for all insights computed for a sync period
- Location: `packages/core/src/sync-engine.ts`
- Pattern: Map-based storage keyed by GSC URL, populated by various analyzers

**ContentTypeUrlConfig:**
- Purpose: Per-content-type URL structure definition
- Location: `packages/core/src/url-matcher.ts`
- Pattern: Flexible configuration supporting multiple URL path structures per content type

## Entry Points

**CLI `sync` Command:**
- Location: `apps/cli/src/commands/sync.ts`
- Triggers: User runs `pagebridge sync --site <url> [options]`
- Responsibilities:
  - Resolve config from env, args, and files
  - Initialize all clients (GSC, DB, Sanity)
  - Run migrations if requested
  - Execute full sync pipeline with progress reporting
  - Handle dry-run mode (analysis only, no writes)
  - Report timing and results

**CLI `list-sites` Command:**
- Location: `apps/cli/src/commands/list-sites.ts`
- Triggers: User runs `pagebridge list-sites`
- Responsibilities: Fetch and display GSC properties

**CLI `init` Command:**
- Location: `apps/cli/src/commands/init.ts`
- Triggers: User runs `pagebridge init`
- Responsibilities: Interactive setup of configuration and credentials

**Sanity Plugin Entry:**
- Location: `packages/sanity-plugin/src/plugin.ts`
- Triggers: Plugin loaded in Sanity Studio configuration
- Responsibilities:
  - Register document schemas (gscSite, gscSnapshot, etc.)
  - Add SEO Insights tool to studio
  - Add Performance pane to configured content types
  - Register InsightBadge on content documents

**Performance Pane:**
- Location: `packages/sanity-plugin/src/components/SearchPerformancePane.tsx`
- Triggers: Editor opens document with Performance view
- Responsibilities: Display gscSnapshot data, top queries, alerts

## Error Handling

**Strategy:** Explicit error propagation with try-catch at CLI level, detailed error logging, database-backed sync status tracking.

**Patterns:**
- `SyncEngine.sync()` catches errors, logs to `sync_log` with status="failed" and error message
- CLI catches errors and reports with exit code 1
- URLMatcher collects unmatched URLs in `unmatchDiagnostics` table with diagnostic info
- Analyzers return empty/null when data unavailable (no throw)
- GSCClient paginated requests break on empty response (no retry logic)
- Index status checks catch per-page errors, continue with remaining pages

## Cross-Cutting Concerns

**Logging:**
- Implementation: `apps/cli/src/logger.ts` with `log.info()`, `log.error()`, `log.debug()` methods
- Used throughout CLI and sync command for progress reporting
- Debug mode adds timing information for performance analysis

**Validation:**
- Config validation in CLI commands using Commander.js
- Environment variable presence checked via `requireConfig()` helper
- URL parsing and normalization in URLMatcher
- Quiet period validation in DecayDetector (ignores recently published content)

**Authentication:**
- GSC: JWT with Google service account credentials
- Sanity: Bearer token in client initialization
- Database: Connection string in environment
- All credentials loaded from environment or command-line args

**Date Handling:**
- Utilities in `packages/core/src/utils/date-utils.ts`
- `daysAgo(n)` for relative dates
- `formatDate(date)` converts to ISO string for API/DB
- `daysSince(date)` calculates age in days

**Sanity Keys:**
- Utility in `packages/core/src/utils/sanity-key.ts`
- Generates stable `_key` identifiers for array items
- Format: deterministic hash of item content to ensure updates work correctly
