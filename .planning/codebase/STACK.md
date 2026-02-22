# Technology Stack

**Analysis Date:** 2026-02-22

## Languages

**Primary:**
- TypeScript 5.9.x - All source code (libraries, CLI, plugins)
- JavaScript - Build output (ES modules)

**Secondary:**
- YAML - Configuration (pnpm-workspace.yaml, drizzle.config)

## Runtime

**Environment:**
- Node.js >=18 (specified in root `package.json`)
- Tested on Node 24 (`.nvmrc` specifies v24)

**Package Manager:**
- pnpm 9.0.0 (locked in `packageManager` field in root `package.json`)
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core:**
- Turborepo 2.8.x - Monorepo build orchestration (root `package.json`)
- TypeScript 5.9.x - Type system and compilation

**CLI:**
- Commander.js 14.0.x - Command-line parsing (`apps/cli/package.json`)
- Node.js built-in modules only (no web framework)

**Database:**
- Drizzle ORM 0.45.x - PostgreSQL query builder and migrations (`packages/db/package.json`)
- Drizzle Kit 0.31.x - Schema generation and migration tooling (dev dependency)

**Sanity Integration:**
- @sanity/client 7.14.x - Headless CMS API client (`packages/core/package.json`, `apps/cli/package.json`)
- Sanity 5.9.0 - Plugin framework (dev/peer in `packages/sanity-plugin/package.json`)
- @sanity/ui 3.1.x - Sanity component library (peer in `packages/sanity-plugin/package.json`)
- @sanity/icons 3.7.x - Icon system (dev/peer in `packages/sanity-plugin/package.json`)

**Google APIs:**
- googleapis 171.1.x - Google APIs client library (`packages/core/package.json`)
- google-auth-library 10.5.x - JWT auth for Google Service Account (`packages/core/package.json`)

**UI/React:**
- React 19.2.x - UI framework (peer in `packages/sanity-plugin/package.json`, dev in `packages/ui/package.json`)
- React-DOM 19.2.x - React renderer (peer in `packages/sanity-plugin/package.json`, dev in `packages/ui/package.json`)
- @swc/helpers 0.5.x - SWC runtime helpers (`packages/sanity-plugin/package.json`)

**Testing:**
- Not detected in current codebase

**Build/Dev:**
- Prettier 3.7.x - Code formatter (root dev dependency)
- ESLint 9.39.x - Linting (all packages)
- dotenv 17.2.x - Environment variable loading (`packages/db/package.json`, `apps/cli/package.json`)

## Key Dependencies

**Critical:**
- `drizzle-orm` 0.45.x - Object-relational mapping layer for type-safe PostgreSQL queries
- `googleapis` 171.1.x - Google Search Console API integration
- `google-auth-library` 10.5.x - JWT authentication for Google service accounts
- `@sanity/client` 7.14.x - Sanity CMS data synchronization
- `postgres` 3.4.x - PostgreSQL driver (`packages/db/package.json`)
- `commander` 14.0.x - CLI argument parsing

**Infrastructure:**
- `dotenv` 17.2.x - Configuration management from .env files
- `@types/node` 22.15.x - Node.js type definitions (all packages)

## Configuration

**Environment:**
- Configured via `.env` and `.env.local` files
- CLI loads env files in order: `.env.local` (highest priority), then `.env`
- Environment variables with `PAGEBRIDGE_` prefix supported (e.g., `PAGEBRIDGE_DATABASE_URL`) and fallback to unprefixed (e.g., `DATABASE_URL`)

**Required Configuration:**
- `GOOGLE_SERVICE_ACCOUNT` - JSON stringified Google service account credentials
- `DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql://postgres:postgres@localhost:5432/gsc_sanity`)
- `SANITY_PROJECT_ID` - Sanity Studio project identifier
- `SANITY_DATASET` - Sanity dataset name (typically `production`)
- `SANITY_TOKEN` - Sanity API token (authenticate CLI for writing data)
- `SITE_URL` - Website base URL for slug/URL matching

**Build:**
- Root: Turborepo orchestrates builds via `turbo run`
- Packages use `tsc` (TypeScript compiler) for builds
- Database: `drizzle.config.ts` at `packages/db/drizzle.config.ts` defines Drizzle Kit behavior
  - Reads schema from `packages/db/src/schema.ts`
  - Outputs migrations to `packages/db/drizzle/` directory
  - Uses `DATABASE_URL` from `.env`

## Platform Requirements

**Development:**
- Node.js 24.x (`.nvmrc`)
- PostgreSQL 17+ (docker-compose uses `postgres:17-alpine`)
- Docker and docker-compose for local database

**Production:**
- Node.js >=18
- PostgreSQL 12+ (tested with 17)
- Google service account with Search Console API access
- Sanity project with custom plugin support (Sanity v4 or v5)

---

*Stack analysis: 2026-02-22*
