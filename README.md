# GSC Sanity Connector

Connect Google Search Console data to Sanity CMS for content performance tracking and content refresh recommendations.

## Features

- **Sync GSC Data**: Fetch search analytics from Google Search Console and store in PostgreSQL
- **URL Matching**: Automatically match GSC URLs to Sanity documents
- **Decay Detection**: Detect content decay patterns (position drops, low CTR, traffic decline)
- **Refresh Tasks**: Generate actionable refresh tasks in Sanity Studio
- **Performance Pane**: View search performance directly in Sanity documents

## Project Structure

This Turborepo includes the following packages/apps:

### Apps

- `cli`: Command-line tool for syncing GSC data
- `docs`: Documentation site ([Next.js](https://nextjs.org/))

### Packages

- `@pagebridge/core`: Sync engine, decay detection, URL matching
- `@pagebridge/db`: PostgreSQL schema and queries (Drizzle ORM)
- `@pagebridge/sanity-plugin`: Sanity Studio v3 components and schemas
- `@pagebridge/ui`: Shared React component library
- `@pagebridge/eslint-config`: ESLint configurations
- `@pagebridge/typescript-config`: TypeScript configurations

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 9+
- Docker (for local PostgreSQL)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/gsc-sanity-connector.git
cd gsc-sanity-connector

# Install dependencies
pnpm install

# Start local PostgreSQL
docker compose up -d

# Copy environment variables
cp .env.example .env.local

# Run database migrations
pnpm --filter @pagebridge/db db:push

# Build all packages
pnpm build
```

### Environment Variables

Create a `.env.local` file with the following variables:

```bash
GOOGLE_SERVICE_ACCOUNT='{"type":"service_account",...}'
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/gsc_sanity'
SANITY_PROJECT_ID='your-project-id'
SANITY_DATASET='production'
SANITY_TOKEN='sk...'
SITE_URL='https://your-site.com'
```

### Usage

#### CLI Sync Command

```bash
# Sync GSC data for a site
pnpm --filter @pagebridge/cli start sync --site sc-domain:example.com

# Dry run (preview without writing)
pnpm --filter @pagebridge/cli start sync --site sc-domain:example.com --dry-run

# Skip task generation
pnpm --filter @pagebridge/cli start sync --site sc-domain:example.com --skip-tasks
```

#### Sanity Plugin

Add the plugin to your Sanity Studio configuration:

```ts
// sanity.config.ts
import { defineConfig } from "sanity";
import { gscPlugin } from "@pagebridge/sanity-plugin";

export default defineConfig({
  // ...
  plugins: [gscPlugin()],
});
```

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting
- [Drizzle ORM](https://orm.drizzle.team/) for database management

### Build

To build all apps and packages, run the following command:

```bash
pnpm build
```

You can build a specific package by using a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

```bash
pnpm build --filter=@pagebridge/core
```

### Develop

To develop all apps and packages, run the following command:

```bash
pnpm dev
```

You can develop a specific package by using a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

```bash
pnpm dev --filter=web
```

## License

MIT
