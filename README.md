<p align="center">
  <img src="https://pagebridge.io/logo.svg" alt="PageBridge" width="48" height="48" />
</p>

<h1 align="center">PageBridge</h1>

<p align="center">
  <strong>Don't just publish content. Keep it.</strong>
</p>

<p align="center">
  PageBridge syncs Google Search Console data into Sanity Studio — so you can detect content decay, track keyword performance, and take action without leaving your editor.
</p>

<p align="center">
  <a href="https://github.com/PageBridge-IO/pagebridge/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://www.npmjs.com/package/@pagebridge/sanity"><img src="https://img.shields.io/npm/v/@pagebridge/sanity.svg" alt="npm" /></a>
  <a href="https://pagebridge.io/docs/quick-start"><img src="https://img.shields.io/badge/docs-pagebridge.io-black.svg" alt="Docs" /></a>
</p>

---

## The Problem

Your best content is already decaying.

Articles silently drop from Position 3 to Position 12 over months. Nobody notices until traffic is gone. Search data lives in Google. Content lives in Sanity. Your team wastes time cross-referencing tabs instead of editing.

PageBridge fixes this by bringing search intelligence directly into your CMS.

## How It Works

```
Google Search Console → PageBridge CLI → PostgreSQL → Sanity Studio
                         (nightly sync)    (metrics)    (insights)
```

**Install** — Add the plugin to your Sanity Studio. One dependency, zero lock-in.

**Connect** — Authenticate with Google Search Console. PageBridge syncs your data to Postgres nightly.

**Act** — Open any document in Sanity. See live performance data, decay warnings, and keyword gaps in the sidebar.

## Features

- **Inline Performance Data** — See clicks, impressions, CTR, and position right inside the Sanity document sidebar while you edit.
- **Content Decay Detection** — Automatic alerts when a page drops in rankings. Catch the slide before traffic disappears.
- **Landing Page Intelligence** — Works on modular page-builder schemas, not just blog posts. See which keywords drive leads to specific landing pages.
- **Striking Distance Queue** — Surfaces pages ranking between Position 4–10 with high impressions. These are your quick wins.
- **Refresh Tasks** — Generates actionable tasks in Sanity Studio for pages that need attention.
- **URL Diagnostics** — Detailed diagnostics for unmatched URLs so you can debug slug mismatches instantly.

## Quick Start

### 1. Install packages

```bash
pnpm add @pagebridge/sanity
pnpm add -D @pagebridge/cli
```

### 2. Add the plugin to Sanity Studio

```ts
// sanity.config.ts
import { defineConfig } from "sanity";
import { pageBridgePlugin } from "@pagebridge/sanity";

export default defineConfig({
  // ...
  plugins: [pageBridgePlugin()],
});
```

### 3. Configure environment variables

Create a `.env.local` (or `.env`) file. PageBridge uses a `PAGEBRIDGE_` prefix to avoid conflicts with your existing env vars:

```bash
# Google Service Account JSON (stringified)
PAGEBRIDGE_GOOGLE_SERVICE_ACCOUNT='{"type":"service_account",...}'

# PostgreSQL connection string
PAGEBRIDGE_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/pagebridge'

# Sanity Studio configuration
PAGEBRIDGE_SANITY_PROJECT_ID='your-project-id'
PAGEBRIDGE_SANITY_DATASET='production'
PAGEBRIDGE_SANITY_TOKEN='sk...'

# Your website base URL
PAGEBRIDGE_SITE_URL='https://your-site.com'
```

### 4. Set up the database

```bash
# Start PostgreSQL (or use an existing instance)
docker run -d --name pagebridge-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=pagebridge \
  -p 5432:5432 \
  postgres:16
```

### 5. Run your first sync

```bash
pnpm pagebridge sync --site sc-domain:your-site.com --migrate
```

That's it. Open Sanity Studio — you'll see performance data in the sidebar and a Refresh Queue tool for decaying content.

> For the full setup guide, see [pagebridge.io/docs/quick-start](https://pagebridge.io/docs/quick-start).

## Packages

This is a Turborepo monorepo. All packages are 100% TypeScript.

| Package | Description | npm |
|---------|-------------|-----|
| [`@pagebridge/sanity`](packages/sanity-plugin) | Sanity Studio v3 plugin — schemas, performance pane, refresh queue | [![npm](https://img.shields.io/npm/v/@pagebridge/sanity.svg)](https://www.npmjs.com/package/@pagebridge/sanity) |
| [`@pagebridge/cli`](apps/cli) | CLI for syncing GSC data, running diagnostics, and managing setup | [![npm](https://img.shields.io/npm/v/@pagebridge/cli.svg)](https://www.npmjs.com/package/@pagebridge/cli) |
| [`@pagebridge/core`](packages/core) | Sync engine, decay detection, URL matching, task generation | [![npm](https://img.shields.io/npm/v/@pagebridge/core.svg)](https://www.npmjs.com/package/@pagebridge/core) |
| [`@pagebridge/db`](packages/db) | Drizzle ORM schema and PostgreSQL client | [![npm](https://img.shields.io/npm/v/@pagebridge/db.svg)](https://www.npmjs.com/package/@pagebridge/db) |

## CLI Commands

```bash
pagebridge init                  # Interactive setup wizard
pagebridge doctor                # Diagnose configuration issues
pagebridge sync --site <url>     # Sync GSC data and detect decay
pagebridge list-sites            # List accessible GSC properties
pagebridge diagnose              # Debug unmatched URLs
```

See the [CLI README](apps/cli/README.md) for full command reference.

## Content Decay Detection

PageBridge watches for three decay signals:

| Signal | Trigger | Window |
|--------|---------|--------|
| **Position decay** | Position drops 3+ spots | 28 days |
| **Low CTR** | CTR < 1% for pages in top 10 | Current |
| **Impressions drop** | 50%+ drop in impressions | 28 days |

Recently published content (default: 45 days) is automatically excluded to avoid false positives.

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Development mode
pnpm dev

# Lint and type check
pnpm lint
pnpm check-types
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
