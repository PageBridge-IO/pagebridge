# Codebase Structure

**Analysis Date:** 2026-02-22

## Directory Layout

```
pagebridge/
├── apps/                           # Application implementations
│   ├── cli/                        # Command-line interface
│   │   ├── src/
│   │   │   ├── commands/           # CLI command implementations
│   │   │   ├── index.ts            # CLI entry point
│   │   │   ├── logger.ts           # Logging utilities
│   │   │   ├── resolve-config.ts   # Config resolution
│   │   │   └── migrate.ts          # Migration utilities
│   │   └── package.json
│   ├── trigger/                    # Trigger.dev integration (scheduled syncs)
│   └── web/                        # Example Next.js app (not detailed)
├── packages/                       # Shared libraries
│   ├── core/                       # Core business logic
│   │   ├── src/
│   │   │   ├── sync-engine.ts      # Main orchestrator
│   │   │   ├── gsc-client.ts       # Google Search Console client
│   │   │   ├── url-matcher.ts      # URL-to-Sanity matching
│   │   │   ├── decay-detector.ts   # Content decay detection
│   │   │   ├── quick-win-analyzer.ts    # Page 1 ranking opportunities
│   │   │   ├── ctr-anomaly-analyzer.ts  # CTR anomaly detection
│   │   │   ├── task-generator.ts        # Refresh task creation
│   │   │   ├── daily-metrics-collector.ts # Daily change tracking
│   │   │   ├── publishing-impact-analyzer.ts # Post-edit performance
│   │   │   ├── cannibalization-analyzer.ts  # Competing page detection
│   │   │   ├── site-insight-analyzer.ts     # Site-level analysis
│   │   │   ├── insight-writer.ts       # Writes insights to Sanity
│   │   │   ├── utils/
│   │   │   │   ├── date-utils.ts       # Date calculations
│   │   │   │   └── sanity-key.ts       # Stable key generation
│   │   │   └── index.ts            # Public exports
│   │   └── package.json
│   ├── db/                         # Database layer
│   │   ├── src/
│   │   │   ├── schema.ts           # Drizzle schema definitions
│   │   │   ├── index.ts            # Database client and exports
│   │   │   └── client.ts           # Client initialization
│   │   ├── drizzle/                # Migration files (generated)
│   │   └── package.json
│   ├── sanity-plugin/              # Sanity Studio plugin
│   │   ├── src/
│   │   │   ├── components/         # React UI components
│   │   │   │   ├── dashboard/      # Dashboard tabs
│   │   │   │   ├── InsightsDashboardTool.tsx    # Main dashboard
│   │   │   │   ├── SearchPerformancePane.tsx    # Doc performance view
│   │   │   │   ├── InsightAlerts.tsx            # Alert rendering
│   │   │   │   └── ...             # Other UI components
│   │   │   ├── schemas/            # Document type definitions
│   │   │   │   ├── gscSite.ts      # Site config schema
│   │   │   │   ├── gscSnapshot.ts  # Performance snapshot schema
│   │   │   │   ├── gscRefreshTask.ts # Task schema
│   │   │   │   ├── gscSiteInsight.ts # Site insights schema
│   │   │   │   └── index.ts
│   │   │   ├── plugin.ts           # Plugin initialization
│   │   │   └── index.ts
│   │   └── package.json
│   ├── ui/                         # Shared React components
│   │   ├── src/                    # Component exports
│   │   └── package.json
│   ├── eslint-config/              # Shared ESLint rules
│   ├── typescript-config/          # Shared TypeScript configs
│   └── [package]/package.json      # Each package has own package.json
├── .planning/                      # Planning and analysis docs
│   └── codebase/                   # Codebase analysis (auto-generated)
├── .github/                        # GitHub workflows and config
├── .vscode/                        # VSCode settings
├── .env                            # Environment variables (local)
├── .env.example                    # Environment template
├── .npmrc                          # npm configuration
├── .nvmrc                          # Node version
├── docker-compose.yml              # PostgreSQL + pgAdmin
├── pnpm-workspace.yaml             # Workspace configuration
├── pnpm-lock.yaml                  # Dependency lock file
├── package.json                    # Root workspace config
├── turbo.json                      # Turborepo configuration
├── CLAUDE.md                       # AI assistant instructions
├── README.md                       # Project overview
├── CONTRIBUTING.md                 # Contribution guidelines
└── LICENSE                         # MIT license
```

## Directory Purposes

**apps/cli/**
- Purpose: Command-line interface for running syncs and management
- Contains: CLI commands (sync, list-sites, init, doctor, diagnose), config resolution, logging
- Key files: `src/commands/sync.ts` (main workflow), `src/index.ts` (entry point)

**packages/core/**
- Purpose: Core business logic and analysis engine
- Contains: GSC client, sync orchestration, URL matching, decay detection, multiple analyzers
- Key files: `src/sync-engine.ts` (orchestrator), `src/gsc-client.ts` (GSC API), `src/index.ts` (exports)

**packages/db/**
- Purpose: Database schema and client initialization
- Contains: Drizzle ORM schema definitions, database client factory, type exports
- Key files: `src/schema.ts` (table definitions), `src/index.ts` (client/exports)

**packages/sanity-plugin/**
- Purpose: Sanity Studio integration and UI
- Contains: Document schemas, React components, dashboard tool
- Key files: `src/plugin.ts` (plugin setup), `src/schemas/` (type definitions)

**packages/ui/**
- Purpose: Shared React components
- Contains: Reusable component library
- Key files: Individual component files in `src/`

**packages/eslint-config/ and packages/typescript-config/**
- Purpose: Shared build and linting configuration
- Contains: Configuration exports for consistency across packages

**.planning/codebase/**
- Purpose: Codebase analysis documentation
- Contains: Auto-generated architecture and structure docs
- Key files: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md

## Key File Locations

**Entry Points:**
- CLI: `apps/cli/src/index.ts` - Sets up Commander.js program, loads .env, registers commands
- Core exports: `packages/core/src/index.ts` - Exports all analyzers and utilities
- Sanity plugin: `packages/sanity-plugin/src/plugin.ts` - definePlugin export
- Database: `packages/db/src/index.ts` - Database client factory and schema exports

**Configuration:**
- Root workspace: `package.json` - Defines build, lint, format scripts
- Workspace config: `pnpm-workspace.yaml` - Monorepo setup
- Turborepo: `turbo.json` - Build pipeline and caching
- TypeScript: `packages/*/tsconfig.json` - TS compilation per package
- ESLint: `.eslintrc.js` or similar - Linting rules

**Core Logic:**
- Sync workflow: `packages/core/src/sync-engine.ts` - Main data flow orchestration
- GSC client: `packages/core/src/gsc-client.ts` - Google Search Console API wrapper
- Analysis: `packages/core/src/*-analyzer.ts` - Multiple analyzer classes
- URL matching: `packages/core/src/url-matcher.ts` - GSC URL to Sanity doc linking
- Task generation: `packages/core/src/task-generator.ts` - Creating refresh tasks

**Database:**
- Schema: `packages/db/src/schema.ts` - Drizzle table definitions
- Migrations: `packages/db/drizzle/` - Auto-generated migration files
- Client: `packages/db/src/client.ts` - Database connection setup

**Sanity Integration:**
- Document types: `packages/sanity-plugin/src/schemas/gsc*.ts` - Schema definitions
- UI Components: `packages/sanity-plugin/src/components/*.tsx` - React components
- Dashboard: `packages/sanity-plugin/src/components/InsightsDashboardTool.tsx` - Main tool

**Testing:**
- Unit tests: Co-located with source files as `*.test.ts` or `*.spec.ts`
- Test config: `vitest.config.ts` (if present) or jest config files
- Test data: `__fixtures__` or `__mocks__` directories (if present)

## Naming Conventions

**Files:**
- Source files: `kebab-case.ts` (e.g., `sync-engine.ts`, `decay-detector.ts`)
- React components: `PascalCase.tsx` (e.g., `SearchPerformancePane.tsx`)
- Tests: `kebab-case.test.ts` or `kebab-case.spec.ts`
- Index files: `index.ts` for barrel exports

**Directories:**
- Package directories: `kebab-case` (e.g., `sanity-plugin`, `eslint-config`)
- Feature directories: `kebab-case` (e.g., `schema`, `components`)
- Resource directories: `kebab-case` (e.g., `commands`, `schemas`, `utils`)

**Types and Interfaces:**
- Interfaces: `PascalCase` (e.g., `MatchResult`, `DecaySignal`)
- Type aliases: `PascalCase` (e.g., `UnmatchReason`, `IndexVerdict`)
- Exported from file: `export interface Name { ... }`

**Functions and Classes:**
- Classes: `PascalCase` (e.g., `SyncEngine`, `URLMatcher`)
- Functions: `camelCase` (e.g., `formatDate`, `daysAgo`)
- Async functions: `camelCase` with `async` keyword

**Variables:**
- Constants: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_BATCH_SIZE`, `CACHE_DURATION_MS`)
- Regular vars/params: `camelCase`
- Private class members: `camelCase` (e.g., `this.gsc`, `this.db`)

## Where to Add New Code

**New Analyzer (e.g., keyword cannibalization detection):**
- Implementation: `packages/core/src/new-analyzer.ts`
- Export: Add to `packages/core/src/index.ts`
- Usage: Import in `apps/cli/src/commands/sync.ts` and call from sync workflow
- Integration: Add insights to `SnapshotInsights` type in `sync-engine.ts`

**New CLI Command (e.g., `export-reports`):**
- Implementation: `apps/cli/src/commands/export-reports.ts`
- Registration: Import and `program.addCommand(exportReportsCommand)` in `apps/cli/src/index.ts`
- Config: Add option parsing in command definition using Commander.js

**New Sanity Schema/Document Type:**
- Schema definition: `packages/sanity-plugin/src/schemas/newType.ts`
- Export: Add to `packages/sanity-plugin/src/schemas/index.ts`
- Plugin: Add to types array in plugin definition in `packages/sanity-plugin/src/plugin.ts`

**New Database Table:**
- Schema: Add table definition to `packages/db/src/schema.ts`
- Client: Ensure exported from `packages/db/src/index.ts`
- Usage: Import table in required files
- Migration: Run `pnpm db:generate` to create migration, then `pnpm db:push`

**New UI Component (React):**
- Component: `packages/sanity-plugin/src/components/NewComponent.tsx` (for plugin)
- Or: `packages/ui/src/NewComponent.tsx` (for shared library)
- Export: Add barrel export in respective `index.ts`
- Usage: Import where needed

**Utility Functions:**
- General utilities: `packages/core/src/utils/util-name.ts`
- CLI utilities: `apps/cli/src/util-name.ts`
- Date/key utilities: Already exist in `packages/core/src/utils/`

## Special Directories

**packages/db/drizzle/:**
- Purpose: Auto-generated Drizzle migration files
- Generated: By `pnpm db:generate` command
- Committed: Yes, to version control
- Manual editing: Avoid; regenerate with `pnpm db:generate`

**.turbo/:**
- Purpose: Turborepo cache and build artifacts
- Generated: By Turborepo during builds
- Committed: No (in .gitignore)
- Manual modification: Never; let Turborepo manage

**node_modules/:**
- Purpose: Installed dependencies
- Generated: By `pnpm install`
- Committed: No (in .gitignore)
- Manual modification: Never; use pnpm

**.next/:**
- Purpose: Next.js build output
- Generated: By `pnpm build` in Next.js apps
- Committed: No (in .gitignore)
- Manual modification: Never; rebuild with `pnpm build`

**dist/:**
- Purpose: Compiled TypeScript output
- Generated: By `pnpm build` per package
- Committed: No (in .gitignore)
- Manual modification: Never; rebuild with `pnpm build`

**.env and .env.local:**
- Purpose: Environment variables (local development)
- Generated: Manual creation required
- Committed: No (in .gitignore)
- Secrets: Contains credentials, never commit
- Template: See `.env.example`

**pnpm-lock.yaml:**
- Purpose: Dependency lock file for reproducible installs
- Generated: By pnpm during `pnpm install`
- Committed: Yes, always commit
- Manual editing: Never; use pnpm commands to modify
