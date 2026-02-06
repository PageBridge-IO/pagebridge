# @pagebridge/sanity-plugin

Sanity Studio v3 plugin for PageBridge. Provides document schemas, UI components, and tools for viewing search performance data and managing content refresh tasks.

## Installation

```bash
pnpm add @pagebridge/sanity-plugin
```

## Setup

### 1. Add the Plugin

In your `sanity.config.ts`:

```typescript
import { defineConfig } from 'sanity';
import { gscPlugin } from '@pagebridge/sanity-plugin';

export default defineConfig({
  // ... other config
  plugins: [
    gscPlugin({
      contentTypes: ['post', 'page'], // Document types to track
    }),
  ],
});
```

### 2. Add the Structure Resolver

To display the Performance pane on your content documents:

```typescript
import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { gscPlugin, createGscStructureResolver } from '@pagebridge/sanity-plugin';

export default defineConfig({
  // ... other config
  plugins: [
    structureTool({
      structure: createGscStructureResolver({
        contentTypes: ['post', 'page'],
      }),
    }),
    gscPlugin({
      contentTypes: ['post', 'page'],
    }),
  ],
});
```

## Document Schemas

The plugin registers three document types:

### gscSite

Represents a Google Search Console property.

| Field | Type | Description |
|-------|------|-------------|
| siteUrl | string | GSC site URL (e.g., `sc-domain:example.com`) |
| slug | slug | URL-friendly identifier |
| defaultLocale | string | Default locale (default: "en") |
| pathPrefix | string | Path prefix for URL matching (e.g., `/blog`) |
| lastSyncedAt | datetime | Last sync timestamp (read-only) |

### gscSnapshot

Performance metrics snapshot linked to content documents.

| Field | Type | Description |
|-------|------|-------------|
| site | reference | Reference to gscSite |
| page | string | Page URL |
| linkedDocument | reference | Matched content document |
| period | string | `last7`, `last28`, or `last90` |
| clicks | number | Total clicks |
| impressions | number | Total impressions |
| ctr | number | Click-through rate |
| position | number | Average position |
| topQueries | array | Top search queries with metrics |
| fetchedAt | datetime | When data was fetched |
| indexStatus | object | Google index status details |

### gscRefreshTask

Content refresh task with decay signal information.

| Field | Type | Description |
|-------|------|-------------|
| site | reference | Reference to gscSite |
| linkedDocument | reference | Content document needing refresh |
| reason | string | `position_decay`, `low_ctr`, `impressions_drop`, `manual` |
| severity | string | `low`, `medium`, `high` |
| status | string | `open`, `snoozed`, `in_progress`, `done`, `dismissed` |
| snoozedUntil | datetime | When to resurface (if snoozed) |
| metrics | object | Position, CTR, impressions data |
| queryContext | array | Top 5 queries with stats |
| notes | text | Resolution notes |
| createdAt | datetime | Task creation time |
| resolvedAt | datetime | Task resolution time |

## Components

### SearchPerformancePane

Document view pane showing performance metrics for a content document.

```typescript
import { SearchPerformancePane } from '@pagebridge/sanity-plugin';

// Used automatically when you configure the structure resolver
// Can also be used directly in custom document views
```

The pane displays:
- Clicks, impressions, CTR, and position metrics
- Top search queries driving traffic
- Google index status
- Link to associated refresh tasks

### RefreshQueueTool

Sanity tool for managing content refresh tasks. Accessible from the Studio sidebar.

Features:
- Filter tasks by status (open, in progress, snoozed, done, dismissed)
- Sort by severity or creation date
- View decay signal details
- Update task status
- Add resolution notes

## Configuration Options

### gscPlugin

```typescript
interface GscPluginConfig {
  // Document types that can be linked to snapshots and tasks
  contentTypes: string[];
}
```

### createGscStructureResolver

```typescript
interface StructureResolverConfig {
  // Document types to show the Performance pane on
  contentTypes: string[];
}
```

## Using Schemas Directly

If you need to customize the schemas or use them without the plugin:

```typescript
import {
  gscSite,
  createGscSnapshot,
  createGscRefreshTask,
} from '@pagebridge/sanity-plugin/schemas';

// Create snapshot schema with custom content types
const customSnapshot = createGscSnapshot({
  contentTypes: ['article', 'guide'],
});

// Create task schema with custom content types
const customTask = createGscRefreshTask({
  contentTypes: ['article', 'guide'],
});
```

## Styling

The components use Sanity UI and follow the Studio's theme. No additional CSS is required.

## Peer Dependencies

- `sanity` >= 3.0.0
- `react` >= 18.0.0
- `react-dom` >= 18.0.0
- `@sanity/ui` >= 2.0.0
- `@sanity/icons` >= 3.0.0

## Exports

```typescript
// Plugin
export { gscPlugin, createGscStructureResolver } from '@pagebridge/sanity-plugin';
export type { GscPluginConfig } from '@pagebridge/sanity-plugin';

// Components
export { SearchPerformancePane, RefreshQueueTool } from '@pagebridge/sanity-plugin';

// Schemas
export {
  gscSite,
  gscSnapshot,
  gscRefreshTask,
  createGscSnapshot,
  createGscRefreshTask,
} from '@pagebridge/sanity-plugin/schemas';
export type { GscSnapshotOptions, GscRefreshTaskOptions } from '@pagebridge/sanity-plugin/schemas';
```

## License

MIT
