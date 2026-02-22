# External Integrations

**Analysis Date:** 2026-02-22

## APIs & External Services

**Google Search Console (GSC):**
- Primary data source for search performance analytics
  - SDK/Client: `googleapis` 171.1.x (`packages/core/package.json`)
  - Implementation: `packages/core/src/gsc-client.ts` — GSCClient class
  - Auth: Google service account JWT authentication
  - Env var: `GOOGLE_SERVICE_ACCOUNT` (JSON stringified credentials)
  - Methods:
    - `fetchSearchAnalytics()` - Query dimensions: page, query, date; row limit 25,000
    - `listSites()` - List all GSC properties
    - `inspectUrl()` - Check individual page indexing status
  - Scopes: `https://www.googleapis.com/auth/webmasters.readonly`

## Data Storage

**Databases:**
- PostgreSQL 12+ (production), 17+ (development)
  - Connection: `DATABASE_URL` env var
  - Client: `postgres` 3.4.x driver
  - ORM: Drizzle ORM 0.45.x via `@pagebridge/db`
  - Schema location: `packages/db/src/schema.ts`
  - Migration tool: Drizzle Kit 0.31.x
  - Tables:
    - `search_analytics` - Daily page-level metrics (clicks, impressions, CTR, position)
    - `query_analytics` - Daily query-level metrics per page
    - `sync_log` - Sync job tracking (status, timestamps, error logs)
    - `page_index_status` - Google index verdict cache (24h freshness)
    - `unmatch_diagnostics` - URL matching failures and diagnostic info

**File Storage:**
- None - All data persisted to PostgreSQL

**Caching:**
- None - In-memory only; no Redis or memcached

## Authentication & Identity

**Google Service Account:**
- Implementation: JWT authentication via `google-auth-library` 10.5.x
- Location: `packages/core/src/gsc-client.ts`
- Credentials required:
  - `client_email` - Service account email
  - `private_key` - RSA private key
- Format: JSON stringified and provided via `GOOGLE_SERVICE_ACCOUNT` env var
- Scopes: webmasters.readonly (read-only GSC access)

**Sanity API Token:**
- Implementation: Bearer token authentication
- Location: CLI at `apps/cli/src/commands/sync.ts` uses `@sanity/client`
- Env var: `SANITY_TOKEN`
- Permissions: Must allow creating/updating documents in specified dataset
- Required for:
  - Writing gscSnapshot documents
  - Creating gscRefreshTask documents
  - Upserting gscSiteInsight documents

## Monitoring & Observability

**Error Tracking:**
- None detected - Relies on CLI logging and database sync_log table

**Logs:**
- CLI logging via `packages/core/src/logger.ts` and `apps/cli/src/logger.ts`
- Console output (stdout/stderr)
- Sync log table tracks job status, errors, and row counts
- Debug mode available via `--debug` flag in sync command

## CI/CD & Deployment

**Hosting:**
- Not specified in codebase (self-hosted or deployment platform agnostic)

**CI Pipeline:**
- None detected in repository

**Build System:**
- Turborepo (monorepo build orchestration)
- pnpm workspaces for dependency management

## Environment Configuration

**Required env vars (all must be set):**
- `GOOGLE_SERVICE_ACCOUNT` - Google service account JSON (stringified)
- `DATABASE_URL` - PostgreSQL connection string
- `SANITY_PROJECT_ID` - Sanity project identifier
- `SANITY_DATASET` - Sanity dataset name
- `SANITY_TOKEN` - Sanity API authentication token
- `SITE_URL` - Website base URL for URL pattern matching

**Optional env vars:**
- `PAGEBRIDGE_*` prefixed versions of above (higher priority than unprefixed)

**Secrets location:**
- `.env` and `.env.local` files (loaded by dotenv)
- Location: Repository root for CLI use
- Priority: `.env.local` > `.env`
- Note: Files not committed to git (in .gitignore)

**Local Database Setup:**
- Docker Compose file: `docker-compose.yml` at repository root
- Starts PostgreSQL 17-alpine service on port 5432
- Default credentials: postgres:postgres (development only)
- Database name: gsc_sanity

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- Sanity API writes (not webhooks, but direct synchronous updates):
  - `gscSnapshot` documents - Performance data
  - `gscRefreshTask` documents - Content refresh tasks from decay detection
  - `gscSiteInsight` documents - Site-wide analytics and insights

## Data Flow & Sync Process

**GSC → PostgreSQL → Sanity:**

1. CLI sync command (`apps/cli/src/commands/sync.ts`) initiated
2. GSCClient fetches raw analytics from Google Search Console API
   - Two separate API calls: page-level and query-level dimensions
   - Pagination handled automatically (row limit 25,000)
3. SyncEngine (`packages/core/src/sync-engine.ts`) orchestrates:
   - Stores page and query analytics in PostgreSQL
   - Runs decay detection (position drops, CTR anomalies, impression drops)
   - Analyzes quick wins (positions 8-20 with high impressions)
   - URL matching against Sanity documents (slug extraction)
   - Caches Google index status
   - Generates refresh tasks for decaying content
4. Sanity updates:
   - Upserts gscSnapshot documents linked to matched Sanity documents
   - Creates gscRefreshTask documents for decay alerts
   - Writes gscSiteInsight document with site-wide metrics
5. Diagnostics logged to PostgreSQL (unmatch_diagnostics for URL failures)

## Integration Points

**Sanity Plugin:**
- Location: `packages/sanity-plugin/`
- Peer dependencies: Sanity v4/v5, React 18/19
- Provides:
  - Custom document types (gscSnapshot, gscRefreshTask, gscSiteInsight)
  - Performance pane UI for content editors
  - Refresh queue tool for managing decay tasks

**Database Migrations:**
- Executed via Drizzle Kit before sync operations
- Command: `pnpm db:migrate` or `pagebridge sync --migrate`
- Location: `packages/db/drizzle/` (auto-generated)
- Configuration: `packages/db/drizzle.config.ts`

---

*Integration audit: 2026-02-22*
