# @pagebridge/cli

Command-line interface for PageBridge. Syncs Google Search Console data to Sanity CMS, detects content decay, and generates refresh tasks.

## Installation

The CLI is a private workspace package. Build and run it from the monorepo root:

```bash
# Build the CLI
pnpm build --filter=@pagebridge/cli

# Run commands
pnpm --filter @pagebridge/cli start <command>

# Or use the binary name directly after building
./apps/cli/dist/index.js <command>
```

## Commands

### sync

Sync Google Search Console data and optionally generate refresh tasks for decaying content.

```bash
pnpm --filter @pagebridge/cli start sync --site sc-domain:example.com
```

Options:

| Option | Description | Default |
|--------|-------------|---------|
| `--site <url>` | GSC site URL (required) | - |
| `--dry-run` | Preview changes without writing to Sanity | false |
| `--skip-tasks` | Only sync data, skip task generation | false |
| `--check-index` | Check Google index status for pages | false |
| `--quiet-period <days>` | Days to ignore recently published content | 45 |

Examples:

```bash
# Basic sync
pnpm --filter @pagebridge/cli start sync --site sc-domain:example.com

# Preview what would be synced
pnpm --filter @pagebridge/cli start sync --site sc-domain:example.com --dry-run

# Sync data only, no refresh tasks
pnpm --filter @pagebridge/cli start sync --site sc-domain:example.com --skip-tasks

# Include index status checks
pnpm --filter @pagebridge/cli start sync --site sc-domain:example.com --check-index

# Use a shorter quiet period (30 days)
pnpm --filter @pagebridge/cli start sync --site sc-domain:example.com --quiet-period 30
```

### list-sites

List all Google Search Console properties accessible by the service account.

```bash
pnpm --filter @pagebridge/cli start list-sites
```

Output:

```
Available GSC Sites:
- sc-domain:example.com
- https://www.example.com/
- sc-domain:another-site.com
```

## Environment Variables

Create a `.env` file in the repository root with:

```bash
# Google Service Account (required)
# JSON stringified credentials from Google Cloud Console
GOOGLE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...","private_key":"..."}'

# PostgreSQL Database (required)
DATABASE_URL=postgresql://user:password@localhost:5432/content_keep

# Sanity Configuration (required)
SANITY_PROJECT_ID=your-project-id
SANITY_DATASET=production
SANITY_TOKEN=your-write-token

# Site URL for URL matching (required)
SITE_URL=https://example.com
```

## Workflow

The `sync` command performs these steps:

1. **Validate environment** - Checks all required variables are set
2. **Find or create gscSite** - Ensures a Sanity document exists for the site
3. **Fetch GSC data** - Retrieves 90 days of search analytics (skipping last 3 days for data stability)
4. **Store metrics** - Writes page and query metrics to PostgreSQL
5. **Match URLs** - Maps GSC pages to Sanity documents by slug
6. **Write snapshots** - Creates gscSnapshot documents in Sanity with metrics and top queries
7. **Check index status** (optional) - Queries Google URL Inspection API
8. **Detect decay** - Analyzes metrics for decay patterns
9. **Generate tasks** - Creates gscRefreshTask documents for pages showing decay

## Programmatic Usage

The CLI uses `@pagebridge/core` under the hood. For programmatic access:

```typescript
import { GSCClient, SyncEngine, DecayDetector, TaskGenerator } from '@pagebridge/core';
import { createDb } from '@pagebridge/db';
import { createClient } from '@sanity/client';

const gscClient = new GSCClient({
  serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT,
});

const db = createDb(process.env.DATABASE_URL);

const sanityClient = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  token: process.env.SANITY_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
});

const engine = new SyncEngine({ gscClient, db, sanityClient });
const result = await engine.sync({
  siteUrl: 'sc-domain:example.com',
  siteId: 'sanity-site-id',
});
```

## Dependencies

- `@pagebridge/core` - Business logic
- `@pagebridge/db` - Database operations
- `@sanity/client` - Sanity API
- `commander` - CLI framework
- `dotenv` - Environment variable loading

## Development

```bash
# Watch mode
pnpm --filter @pagebridge/cli dev

# Build
pnpm --filter @pagebridge/cli build

# Type check
pnpm --filter @pagebridge/cli check-types
```

## License

MIT
