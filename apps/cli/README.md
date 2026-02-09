# @pagebridge/cli

Command-line interface for PageBridge. Syncs Google Search Console data to your PostgreSQL database, matches URLs to Sanity documents, detects content decay, and generates refresh tasks.

## Installation

```bash
pnpm add -D @pagebridge/cli
```

Or run from the monorepo:

```bash
pnpm build --filter=@pagebridge/cli
```

## Commands

### `pagebridge init`

Interactive setup wizard. Walks you through configuring credentials, tests each connection, and writes a `.env` file with `PAGEBRIDGE_`-prefixed variables.

```bash
pagebridge init
```

Options:

| Option | Description |
|--------|-------------|
| `--skip-db-check` | Skip database connection test |
| `--skip-sanity-check` | Skip Sanity API test |
| `--skip-gsc-check` | Skip Google Search Console API test |

### `pagebridge doctor`

Diagnose configuration issues. Checks your env file, credentials, database connection, schema, Sanity access, and GSC API access.

```bash
pagebridge doctor
pagebridge doctor --verbose
```

Looks for `.env.local` first, then `.env`. Loads the file and validates all required variables.

### `pagebridge sync`

Sync Google Search Console data and optionally generate refresh tasks for decaying content.

```bash
pagebridge sync --site sc-domain:example.com
```

Options:

| Option | Description | Default |
|--------|-------------|---------|
| `--site <url>` | GSC site URL **(required)** | — |
| `--dry-run` | Preview changes without writing to Sanity | `false` |
| `--skip-tasks` | Only sync data, skip task generation | `false` |
| `--check-index` | Check Google index status for pages | `false` |
| `--quiet-period <days>` | Days to ignore recently published content | `45` |
| `--diagnose` | Show detailed diagnostics for unmatched URLs | `false` |
| `--diagnose-url <url>` | Diagnose why a specific URL is not matching | — |
| `--migrate` | Run database migrations before syncing | `false` |
| `--debug` | Enable debug logging with timing information | `false` |

All credentials can also be passed as flags (`--db-url`, `--sanity-project-id`, etc.) to override env vars.

Examples:

```bash
# First sync — creates tables automatically
pagebridge sync --site sc-domain:example.com --migrate

# Preview what would be synced
pagebridge sync --site sc-domain:example.com --dry-run

# Sync data only, no refresh tasks
pagebridge sync --site sc-domain:example.com --skip-tasks

# Debug why a URL isn't matching
pagebridge sync --site sc-domain:example.com --diagnose-url https://example.com/my-page
```

### `pagebridge list-sites`

List all Google Search Console properties accessible by the configured service account.

```bash
pagebridge list-sites
```

### `pagebridge diagnose`

Show stored diagnostics for unmatched URLs from previous sync runs.

```bash
pagebridge diagnose --site sc-domain:example.com
```

## Environment Variables

Create a `.env.local` or `.env` file. PageBridge uses a `PAGEBRIDGE_` prefix to avoid conflicts with your project's existing env vars:

```bash
# Google Service Account JSON (stringified)
PAGEBRIDGE_GOOGLE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"..."}'

# PostgreSQL connection string
PAGEBRIDGE_DATABASE_URL='postgresql://user:password@localhost:5432/pagebridge'

# Sanity configuration
PAGEBRIDGE_SANITY_PROJECT_ID='your-project-id'
PAGEBRIDGE_SANITY_DATASET='production'
PAGEBRIDGE_SANITY_TOKEN='sk...'

# Your website base URL (used for URL matching)
PAGEBRIDGE_SITE_URL='https://example.com'
```

Unprefixed names (`DATABASE_URL`, `SANITY_TOKEN`, etc.) are also supported as a fallback. The `PAGEBRIDGE_`-prefixed version always takes priority.

## Sync Workflow

The `sync` command performs these steps:

1. **Validate connections** — Tests database, Sanity, and GSC access
2. **Find or create gscSite** — Ensures a Sanity document exists for the site
3. **Fetch GSC data** — Retrieves 90 days of search analytics (skipping last 3 days for data stability)
4. **Store metrics** — Writes page and query metrics to PostgreSQL
5. **Match URLs** — Maps GSC pages to Sanity documents by slug
6. **Detect decay** — Analyzes metrics for position drops, CTR issues, and traffic decline
7. **Generate tasks** — Creates `gscRefreshTask` documents for pages showing decay
8. **Write snapshots** — Creates `gscSnapshot` documents in Sanity with metrics and top queries

## Dependencies

- `@pagebridge/core` — Sync engine, decay detection, URL matching
- `@pagebridge/db` — PostgreSQL schema and queries
- `@sanity/client` — Sanity API client
- `commander` — CLI framework

## Development

```bash
# Watch mode
pnpm dev --filter=@pagebridge/cli

# Build
pnpm build --filter=@pagebridge/cli

# Type check
pnpm check-types --filter=@pagebridge/cli
```

## License

MIT
