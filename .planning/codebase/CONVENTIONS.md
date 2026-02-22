# Coding Conventions

**Analysis Date:** 2026-02-22

## Naming Patterns

**Files:**
- `camelCase.ts` for TypeScript source files
- `PascalCase.tsx` for React component files
- `UPPERCASE.md` for documentation
- Files grouped logically: e.g., `decay-detector.ts`, `url-matcher.ts`, `gsc-client.ts` (descriptive names with hyphens between words)
- Utility files in `/utils` subdirectories: `date-utils.ts`, `sanity-key.ts`

**Functions:**
- `camelCase` for function names: `daysAgo()`, `formatDate()`, `fetchSearchAnalytics()`
- React component functions: `PascalCase`: `SearchPerformancePane`, `InsightAlerts`, `InsightBadge`
- Private methods prefixed with underscore or kept as private class members
- Example: `async analyze(siteId: string): Promise<Map<string, QuickWinQuery[]>>`

**Variables:**
- `camelCase` for local variables and parameters: `siteUrl`, `startDate`, `quietPeriodDays`, `validMatches`
- Constants in UPPERCASE (rare in codebase): `BATCH_SIZE = 500`, `SANITY_API_VERSION`
- Map/Set declarations use plural nouns: `snapshotIdMap`, `indexStatusMap`, `pages`
- Event handlers: `onProgress`, `onSuccess` (explicit callback naming)

**Types:**
- `PascalCase` for interfaces and types: `GSCClientOptions`, `SearchAnalyticsRow`, `DecaySignal`
- Suffix pattern: `*Options` for configuration objects, `*Result` for return types, `*Config` for configurations
- Type unions use descriptive names: `type IndexVerdict = "PASS" | "FAIL" | "NEUTRAL"`
- Severity levels: `"low" | "medium" | "high"` (lowercase)
- Status values: `"open" | "in_progress" | "completed"` (snake_case in data models)

## Code Style

**Formatting:**
- Tool: Prettier v3.7.4
- Command: `pnpm format` (formats `**/*.{ts,tsx,md}`)
- Line length: Default Prettier (80 characters)
- Indentation: 2 spaces (Prettier default)
- Semicolons: Required (Prettier default)

**Linting:**
- Tool: ESLint v9.39.1 with TypeScript support
- Config: Modular configs in `packages/eslint-config/`
  - Base config: `base.js` - JavaScript, TypeScript, Prettier integration
  - React config: `react-internal.js` - React-specific rules
  - Next.js config: `next.js` - Next.js specific rules
- Run: `pnpm lint` (turbo filtered)
- Extends: `@eslint/js`, `typescript-eslint/recommended`, `eslint-config-prettier`
- Plugin: `eslint-plugin-turbo` for monorepo rules (warns on undeclared env vars)
- Plugin: `eslint-plugin-only-warn` (converts errors to warnings)
- Plugin: `eslint-plugin-react` and `eslint-plugin-react-hooks` for React

**Key Rules:**
- No console.log in production code (enforce via linting in future)
- Prefer explicit imports over wildcard imports
- Module scope: Classes for business logic (GSCClient, SyncEngine), functions for utilities

## Import Organization

**Order:**
1. External library imports: `import { google } from "googleapis"`
2. Type-only imports separated: `import type { JWT } from "google-auth-library"`
3. Internal package imports: `import { @pagebridge/core } from "..."`
4. Relative imports from same package: `import { ... } from "./utils/date-utils.js"`
5. Exports (if module): `export { ... }`

**Path Aliases:**
- No path aliases configured in base tsconfig
- Monorepo workspace imports: `import { searchAnalytics } from "@pagebridge/db"` (npm package style)
- All internal imports use full package names via npm workspace paths

**File Extensions:**
- Always use `.js` extension in imports (ES module): `from "./decay-detector.js"`
- Drizzle SQL imports use named exports: `import { and, eq, gte } from "drizzle-orm"`
- Database imports from `@pagebridge/db` re-export common operators

## Error Handling

**Patterns:**
- Try-catch blocks around async operations that can fail
- Example pattern from `sync-engine.ts`:
  ```typescript
  try {
    // Sync operations
  } catch (error) {
    await this.db.update(syncLog).set({
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;  // Re-throw for caller to handle
  }
  ```
- Explicit error type checking: `error instanceof Error ? error.message : String(error)`
- Errors logged to database sync_log table with status "failed"
- CLI commands exit with `process.exit(1)` on validation errors

**Error Messages:**
- Descriptive and actionable: `"Could not find siteUrl for site ID: ${siteId}"`
- Include context values in message: `"Invalid --quiet-period value: \"${options.quietPeriod}\""`
- Validation errors logged before exit: `log.error()` then `process.exit(1)`

## Logging

**Framework:** Custom logger in `apps/cli/src/logger.ts` using console methods

**Patterns:**
```typescript
// logger.ts structure
export const log = {
  info(msg: string) { ... },
  warn(msg: string) { ... },
  error(msg: string) { ... },
  debug(msg: string, enabled: boolean) { ... }
};
```

**When to Log:**
- Progress updates during long operations: `progress("Fetching data from Google Search Console...")`
- Warnings for deprecated features: `console.warn("[URLMatcher] Deprecated: ...")` in business logic
- Errors with context: Full error message + stacktrace via throw
- Debug output only in CLI with `--debug` flag

**Logging in Business Logic:**
- `packages/core` uses `console.warn()` for deprecation notices
- Sync progress reported via optional `onProgress?: (message: string) => void` callback
- No error logging in libraries (libraries throw, callers decide logging strategy)

## Comments

**When to Comment:**
- JSDoc for public class methods and exported functions
- Inline comments for complex algorithm logic
- Comments before database migrations or schema changes
- Deprecated API guidance with migration path

**JSDoc/TSDoc Usage:**
- Present on exported class methods: All public methods in `GSCClient`, `SyncEngine`, `DecayDetector`
- Pattern: Multi-line comment above method describing purpose, params, and return
- Example from `quick-win-analyzer.ts`:
  ```typescript
  /**
   * Finds "quick win" queries for all pages: queries where position is 8-20
   * with significant impressions. These are page-1 opportunities where a small
   * content tweak could improve ranking.
   */
  async analyze(siteId: string): Promise<Map<string, QuickWinQuery[]>>
  ```
- Parameter types documented in signatures (TypeScript), not JSDoc params block
- Void returns not documented if obvious from context

## Function Design

**Size:**
- Small, focused functions preferred (utilities 10-20 lines)
- Business logic methods range 20-100 lines with clear phases
- Large methods use progress callbacks to report status (e.g., sync batches 500 rows at a time)

**Parameters:**
- Options object pattern for 3+ parameters: `{ gsc, db, sanity }` instead of positional args
- Callback pattern for progress/events: `onProgress?: (message: string) => void`
- Backward compatibility: Support both old and new signatures (see `TaskGenerator.constructor`)

**Return Values:**
- Explicit types on all async functions: `Promise<SyncResult>`
- Maps for many-to-many relationships: `Promise<Map<string, QuickWinQuery[]>>`
- Sets for unique collections: `Set<string>`
- Arrays when order matters: `DecaySignal[]`
- Tuples for fixed pairs: `Promise<[pageRows, queryRows]>` in parallel fetches

## Module Design

**Exports:**
- Class-based modules export single class: `export class GSCClient { ... }`
- Interfaces exported alongside: `export interface GSCClientOptions`
- Type exports: `export type IndexVerdict = "PASS" | "FAIL" | "NEUTRAL"`
- Index barrel files: `packages/core/src/index.ts` exports all public APIs

**Barrel Files:**
- `packages/core/src/index.ts` re-exports all classes and types
- `packages/db/src/index.ts` exports schema, client factory, and drizzle utilities
- Pattern allows clean imports: `import { GSCClient, SyncEngine } from "@pagebridge/core"`

**Monorepo Package Structure:**
- Each package (`core`, `db`, `ui`, `sanity-plugin`) has own `tsconfig.json`
- Each package has own `eslint.config.js` (or `.mjs`)
- Shared configs via `@pagebridge/eslint-config` and `@pagebridge/typescript-config`
- Build: `tsc` for libraries, separate build step per app

---

*Convention analysis: 2026-02-22*
