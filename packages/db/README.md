# @content-keep/db

Database layer for Content Keep, providing Drizzle ORM schema definitions and PostgreSQL client utilities.

## Installation

```bash
pnpm add @content-keep/db
```

## Usage

### Creating a Database Client

```typescript
import { createDb } from '@content-keep/db';

const db = createDb(process.env.DATABASE_URL);

// Or with an existing postgres.js client
import postgres from 'postgres';
import { createDbWithClient } from '@content-keep/db';

const sql = postgres(process.env.DATABASE_URL);
const db = createDbWithClient(sql);
```

### Querying Data

```typescript
import { createDb, searchAnalytics, queryAnalytics } from '@content-keep/db';
import { eq, and, gte } from 'drizzle-orm';

const db = createDb(process.env.DATABASE_URL);

// Fetch page metrics
const metrics = await db
  .select()
  .from(searchAnalytics)
  .where(
    and(
      eq(searchAnalytics.siteId, 'site-id'),
      gte(searchAnalytics.date, '2024-01-01')
    )
  );

// Fetch query-level data for a page
const queries = await db
  .select()
  .from(queryAnalytics)
  .where(
    and(
      eq(queryAnalytics.siteId, 'site-id'),
      eq(queryAnalytics.page, 'https://example.com/blog/post')
    )
  );
```

### Inserting Data

```typescript
import { searchAnalytics, syncLog } from '@content-keep/db';

// Insert or update metrics (upsert)
await db
  .insert(searchAnalytics)
  .values({
    id: `${siteId}:${page}:${date}`,
    siteId,
    page,
    date,
    clicks: 100,
    impressions: 1000,
    ctr: 0.1,
    position: 5.2,
  })
  .onConflictDoUpdate({
    target: searchAnalytics.id,
    set: {
      clicks: 100,
      impressions: 1000,
      ctr: 0.1,
      position: 5.2,
    },
  });

// Log sync job
await db.insert(syncLog).values({
  siteId,
  startedAt: new Date(),
  status: 'running',
});
```

## Schema

### searchAnalytics

Daily page-level metrics from Google Search Console.

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | Composite: `${siteId}:${page}:${date}` |
| siteId | text | Reference to Sanity gscSite document |
| page | text | Full page URL |
| date | text | Date in YYYY-MM-DD format |
| clicks | integer | Total clicks |
| impressions | integer | Total impressions |
| ctr | real | Click-through rate (0-1) |
| position | real | Average position |

Indexes: `(siteId, page)`, `(siteId, date)`

### queryAnalytics

Daily query-level metrics per page.

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | Composite: `${siteId}:${page}:${query}:${date}` |
| siteId | text | Reference to Sanity gscSite document |
| page | text | Full page URL |
| query | text | Search query |
| date | text | Date in YYYY-MM-DD format |
| clicks | integer | Clicks for this query |
| impressions | integer | Impressions for this query |
| ctr | real | Click-through rate |
| position | real | Average position |

Index: `(siteId, page, query)`

### syncLog

Tracks sync job execution history.

| Column | Type | Description |
|--------|------|-------------|
| id | serial (PK) | Auto-incrementing ID |
| siteId | text | Site being synced |
| startedAt | timestamp | Job start time |
| completedAt | timestamp | Job completion time |
| rowsProcessed | integer | Number of rows synced |
| status | text | `running`, `completed`, `failed` |
| error | text | Error message if failed |

### pageIndexStatus

Cached Google index status for pages.

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | Composite: `${siteId}:${page}` |
| siteId | text | Reference to Sanity gscSite document |
| page | text | Full page URL |
| verdict | text | Index verdict from Google |
| coverageState | text | Coverage state |
| indexingState | text | Indexing state |
| pageFetchState | text | Page fetch state |
| lastCrawlTime | timestamp | Last crawl timestamp |
| robotsTxtState | text | Robots.txt state |

Index: `(siteId, page)`

## Database Commands

Run these from the repository root:

```bash
# Generate migrations from schema changes
pnpm db:generate

# Run pending migrations
pnpm db:migrate

# Push schema directly to database (development)
pnpm db:push

# Open Drizzle Studio GUI
pnpm db:studio
```

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string

Example:
```
DATABASE_URL=postgresql://user:password@localhost:5432/content_keep
```

## Local Development

Start a local PostgreSQL instance:

```bash
docker compose up -d
```

Then push the schema:

```bash
pnpm db:push
```

## Exports

```typescript
// Client factories
export { createDb, createDbWithClient } from '@content-keep/db';
export type { DrizzleClient } from '@content-keep/db';

// Schema tables
export {
  searchAnalytics,
  queryAnalytics,
  syncLog,
  pageIndexStatus,
} from '@content-keep/db/schema';

// Types
export type {
  SearchAnalytics,
  NewSearchAnalytics,
  QueryAnalytics,
  NewQueryAnalytics,
  SyncLog,
  NewSyncLog,
  PageIndexStatus,
  NewPageIndexStatus,
} from '@content-keep/db/schema';
```

## License

MIT
