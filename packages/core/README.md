# @pagebridge/core

Core business logic for syncing Google Search Console data to Sanity CMS, detecting content decay patterns, and generating refresh tasks.

## Installation

```bash
pnpm add @pagebridge/core
```

## Overview

This package provides the main building blocks for content performance tracking:

- **GSCClient** - Fetches search analytics from Google Search Console API
- **SyncEngine** - Orchestrates data sync between GSC, PostgreSQL, and Sanity
- **DecayDetector** - Analyzes metrics to identify content decay patterns
- **URLMatcher** - Maps GSC URLs to Sanity documents by slug
- **TaskGenerator** - Creates refresh tasks in Sanity for decaying content

## Usage

### GSCClient

Authenticates with Google and fetches search analytics data.

```typescript
import { GSCClient } from '@pagebridge/core';

const client = new GSCClient({
  serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT,
});

// List available sites
const sites = await client.listSites();

// Fetch search analytics
const data = await client.fetchSearchAnalytics({
  siteUrl: 'sc-domain:example.com',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  dimensions: ['page', 'query'],
});

// Check URL index status
const status = await client.inspectUrl({
  siteUrl: 'sc-domain:example.com',
  inspectionUrl: 'https://example.com/blog/post',
});
```

### SyncEngine

Coordinates the full sync workflow: fetching data, storing metrics, and writing Sanity snapshots.

```typescript
import { SyncEngine } from '@pagebridge/core';
import { createDb } from '@pagebridge/db';
import { createClient } from '@sanity/client';

const db = createDb(process.env.DATABASE_URL);
const sanityClient = createClient({
  projectId: 'your-project',
  dataset: 'production',
  token: process.env.SANITY_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
});

const engine = new SyncEngine({
  gscClient,
  db,
  sanityClient,
});

const result = await engine.sync({
  siteUrl: 'sc-domain:example.com',
  siteId: 'sanity-site-document-id',
  dryRun: false,
});
```

### DecayDetector

Identifies content showing signs of performance decline.

```typescript
import { DecayDetector } from '@pagebridge/core';

const detector = new DecayDetector({
  db,
  rules: [
    {
      name: 'position_decay',
      enabled: true,
      threshold: 3, // positions dropped
      windowDays: 28,
    },
    {
      name: 'low_ctr',
      enabled: true,
      threshold: 0.01, // 1% CTR
      positionThreshold: 10,
    },
    {
      name: 'impressions_drop',
      enabled: true,
      threshold: 0.5, // 50% drop
      windowDays: 28,
    },
  ],
  quietPeriod: {
    enabled: true,
    days: 45,
  },
});

const signals = await detector.detect({
  siteId: 'sanity-site-document-id',
  documents: matchedDocuments,
});
```

### URLMatcher

Maps GSC page URLs to Sanity documents.

```typescript
import { URLMatcher } from '@pagebridge/core';

const matcher = new URLMatcher({
  siteUrl: 'https://example.com',
  pathPrefix: '/blog',
});

const results = matcher.match({
  pages: gscPages,
  documents: sanityDocuments,
});

// Results include exact, normalized, and fuzzy matches
```

### TaskGenerator

Creates refresh tasks in Sanity for pages with decay signals.

```typescript
import { TaskGenerator } from '@pagebridge/core';

const generator = new TaskGenerator({
  sanityClient,
  siteId: 'sanity-site-document-id',
});

const tasks = await generator.generate({
  signals: decaySignals,
  dryRun: false,
});
```

## Decay Detection Rules

The default rules detect three patterns:

| Rule | Description | Default Threshold |
|------|-------------|-------------------|
| `position_decay` | Average position dropped significantly | 3+ positions over 28 days |
| `low_ctr` | Low CTR despite good rankings | CTR < 1% for pages in top 10 |
| `impressions_drop` | Sharp decline in impressions | 50%+ drop over 28 days |

A configurable "quiet period" (default 45 days) prevents flagging recently published content.

## Environment Variables

Required for full functionality:

- `GOOGLE_SERVICE_ACCOUNT` - JSON stringified Google service account credentials
- `DATABASE_URL` - PostgreSQL connection string
- `SANITY_PROJECT_ID` - Sanity project ID
- `SANITY_DATASET` - Sanity dataset name
- `SANITY_TOKEN` - Sanity API token with write access

## API Reference

### Types

```typescript
// GSC Client
interface GSCClientOptions {
  serviceAccountJson: string;
}

interface IndexStatusResult {
  verdict: IndexVerdict;
  coverageState: string;
  indexingState: string;
  pageFetchState: string;
  lastCrawlTime?: string;
  robotsTxtState: string;
}

// Sync Engine
interface SyncOptions {
  siteUrl: string;
  siteId: string;
  dryRun?: boolean;
  days?: number;
}

interface SyncResult {
  rowsProcessed: number;
  snapshotsWritten: number;
  errors: string[];
}

// Decay Detection
interface DecaySignal {
  page: string;
  documentId: string;
  rule: string;
  severity: 'low' | 'medium' | 'high';
  metrics: {
    before: number;
    now: number;
    delta: number;
  };
}

// URL Matching
interface MatchResult {
  page: string;
  documentId: string;
  matchType: 'exact' | 'normalized' | 'fuzzy';
  confidence: number;
}
```

## License

MIT
