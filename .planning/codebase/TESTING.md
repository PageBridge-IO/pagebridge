# Testing Patterns

**Analysis Date:** 2026-02-22

## Test Framework

**Status:** No testing framework currently configured in the codebase.

**Observation:** The codebase has zero test files (no `.test.ts`, `.spec.ts` files found in `packages/` or `apps/` directories). This is a significant quality gap for a library distributed via npm.

**Framework Recommendation:** If testing is added, consider:
- **Vitest** - Fast, ESM-native, great for TypeScript libraries
- **Jest** - Industry standard, excellent for monorepos with Turbo integration

**Run Commands (if implemented):**
```bash
pnpm test                # Run all tests
pnpm test --watch      # Watch mode
pnpm test --coverage   # Coverage report
pnpm test --filter=@pagebridge/core  # Test specific package
```

## Test File Organization

**Location:** Not yet established (recommend parallel with source)

**Naming Convention (when added):**
- One `*.test.ts` per source file: `gsc-client.test.ts` for `gsc-client.ts`
- Or group-based: `__tests__/` directory per module
- Test parity: `packages/core/src/decay-detector.ts` → `packages/core/src/decay-detector.test.ts`

**Proposed Structure:**
```
packages/core/src/
├── gsc-client.ts
├── gsc-client.test.ts           # or __tests__/gsc-client.test.ts
├── sync-engine.ts
├── sync-engine.test.ts
├── decay-detector.ts
├── decay-detector.test.ts
└── utils/
    ├── date-utils.ts
    └── date-utils.test.ts
```

## Test Structure

**Patterns to adopt (recommended based on codebase style):**

Classes with clear responsibilities suggest unit test structure:

```typescript
// Example pattern from codebase structure:
// GSCClient manages Google API interaction - should test:
// 1. Constructor and authentication setup
// 2. API error handling and retries
// 3. Data transformation (SearchAnalyticsRow conversion)

describe("GSCClient", () => {
  let client: GSCClient;

  beforeEach(() => {
    client = new GSCClient({
      credentials: {
        client_email: "test@example.com",
        private_key: "-----BEGIN PRIVATE KEY-----...",
      }
    });
  });

  describe("fetchSearchAnalytics", () => {
    it("fetches and transforms page-level data", async () => {
      // Test expects SearchAnalyticsRow[] with correct structure
    });
  });
});

// SyncEngine orchestrates multiple services:
// Should test coordination and error propagation
describe("SyncEngine", () => {
  let engine: SyncEngine;

  beforeEach(() => {
    engine = new SyncEngine({
      gsc: mockGSCClient,
      db: mockDatabase,
      sanity: mockSanityClient,
    });
  });

  describe("sync", () => {
    it("batches writes at 500 rows per request", async () => {
      // Verify batching logic
    });

    it("updates sync_log on failure with error message", async () => {
      // Test error path that logs to database
    });
  });
});
```

## Mocking

**Framework Suggestion:**
- Vitest's built-in `vi.mock()` or external `jest-mock-extended`
- For Drizzle ORM: Mock return database query results

**Patterns to follow:**

1. **Service Mocks** - Mock constructor dependencies:
```typescript
const mockGSCClient: GSCClient = {
  fetchSearchAnalytics: vi.fn().mockResolvedValue([
    {
      page: "https://example.com/page",
      clicks: 10,
      impressions: 100,
      ctr: 0.1,
      position: 5,
    }
  ]),
  getIndexStatus: vi.fn().mockResolvedValue({ verdict: "PASS" }),
};
```

2. **Database Mocks** - Mock Drizzle query builders:
```typescript
const mockDb = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([...]),
    }),
  }),
};
```

3. **Sanity Client Mocks** - Mock GROQ query results:
```typescript
const mockSanity = {
  fetch: vi.fn().mockResolvedValue({
    _id: "doc-123",
    _type: "gscSite",
    siteUrl: "https://example.com",
  }),
  create: vi.fn().mockResolvedValue({ _id: "created-task" }),
};
```

**What to Mock:**
- External API calls (Google Search Console, Sanity CMS, PostgreSQL)
- Time-based functions in tests (use fake timers)
- Database operations (return controlled test data)
- File I/O (environment loading)

**What NOT to Mock:**
- Utility functions like `daysAgo()`, `formatDate()`, `sanityKey()`
- Core algorithm logic (decay detection, URL matching)
- Type transformations and data mapping
- Import order and module structure

## Fixtures and Factories

**Test Data Strategy (to establish):**

Create factory functions for common test data:

```typescript
// __tests__/fixtures/gsc-data.ts
export function createSearchAnalyticsRow(
  overrides?: Partial<SearchAnalyticsRow>
): SearchAnalyticsRow {
  return {
    page: "https://example.com/test",
    query: "test query",
    date: "2026-02-22",
    clicks: 5,
    impressions: 50,
    ctr: 0.1,
    position: 3,
    ...overrides,
  };
}

export function createDecaySignal(
  overrides?: Partial<DecaySignal>
): DecaySignal {
  return {
    page: "https://example.com/decaying",
    reason: "position_decay",
    severity: "high",
    metrics: {
      positionBefore: 5,
      positionNow: 8,
      positionDelta: 3,
      ctrBefore: 0.15,
      ctrNow: 0.10,
      impressions: 200,
    },
    ...overrides,
  };
}

// Usage in tests:
const signal = createDecaySignal({ severity: "medium" });
```

**Location:**
- `packages/core/__tests__/fixtures/` for core library
- `apps/cli/__tests__/fixtures/` for CLI
- `packages/sanity-plugin/__tests__/fixtures/` for plugin

## Coverage

**Current Status:** No coverage tracking configured

**Recommended Target:**
- Libraries (`@pagebridge/core`, `@pagebridge/db`): 80%+ coverage
- UI components (`@pagebridge/ui`): 75%+ coverage (React component testing is slower)
- Apps (CLI, docs): 60%+ (focus on critical paths)

**View Coverage:**
```bash
pnpm test --coverage
# or per-package
pnpm test --filter=@pagebridge/core --coverage
```

**High-Priority Areas for Coverage:**
1. `packages/core/src/decay-detector.ts` - Business logic for decay rules
2. `packages/core/src/url-matcher.ts` - URL matching algorithm with backward compatibility
3. `packages/core/src/sync-engine.ts` - Error handling and batching logic
4. `apps/cli/src/commands/sync.ts` - Command validation and option parsing

## Test Types

**Unit Tests:**
- Scope: Single class or function
- Approach: Mock all external dependencies
- Location: `**/src/*.test.ts`
- Focus areas:
  - `GSCClient`: Auth setup, data transformation, pagination
  - `URLMatcher`: URL matching algorithms, fuzzy matching, config handling
  - `DecayDetector`: Decay rule evaluation, quiet period logic
  - Utility functions: `daysAgo()`, `formatDate()`, `daysSince()`, `sanityKey()`

**Integration Tests:**
- Scope: Multiple classes working together
- Approach: Mock external APIs (Sanity, GSC), use real database (test DB)
- Location: `**/__tests__/integration/`
- Focus areas:
  - `SyncEngine.sync()` → `SyncEngine.writeSnapshots()` flow
  - `TaskGenerator.createTasks()` consuming `DecayDetector` output
  - URL matching pipeline: fetch pages → match URLs → store diagnostics

**E2E Tests:**
- Status: Not currently implemented
- Recommendation: Add end-to-end tests for CLI workflows when feature-stable
- Tool: Consider `vitest` for CLI testing with mocked environment
- Focus: `pnpm sync --site` command flow with test database

## Common Patterns

**Async Testing:**

From codebase observations, all external I/O is async. Test async patterns:

```typescript
// Pattern 1: Using async/await (recommended, matches codebase style)
it("syncs data and returns result", async () => {
  const result = await engine.sync({ siteUrl: "sc-domain:example.com" });
  expect(result).toHaveProperty("pages");
  expect(result.rowsProcessed).toBeGreaterThan(0);
});

// Pattern 2: Using .resolves assertion
it("fetches index status", async () => {
  await expect(client.getIndexStatus("page-url")).resolves.toMatchObject({
    verdict: "PASS"
  });
});

// Pattern 3: Testing rejected promises
it("throws on invalid site URL", async () => {
  await expect(
    engine.sync({ siteUrl: "" })
  ).rejects.toThrow("invalid");
});
```

**Error Testing:**

Error handling is critical in sync operations. Test error paths:

```typescript
describe("sync error handling", () => {
  it("logs failed sync status when GSC fetch fails", async () => {
    mockGSCClient.fetchSearchAnalytics.mockRejectedValueOnce(
      new Error("GSC API error")
    );

    await expect(engine.sync({ ... })).rejects.toThrow();

    // Verify database sync_log was updated
    expect(mockDb.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  it("handles error message normalization", async () => {
    mockDb.update.mockImplementationOnce((sql) => ({
      set: vi.fn().mockImplementationOnce((values) => {
        // Should normalize non-Error objects to String
        expect(values.error).toEqual(expect.any(String));
      }),
    }));
  });
});

// URL Matcher backward compatibility errors
describe("URLMatcher deprecation", () => {
  it("warns when using deprecated config format", async () => {
    const warnSpy = vi.spyOn(console, "warn");

    new URLMatcher(mockSanity, {
      contentTypes: ["post"],
      slugField: "slug",
      pathPrefix: "/blog",
      baseUrl: "https://example.com"
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Deprecated")
    );
  });
});
```

**Batching & Performance Tests:**

Test performance-critical paths like batching:

```typescript
it("batches 500 rows per database insert", async () => {
  // Create 1500 rows (3 batches)
  const rows = Array(1500).fill(null).map((_, i) =>
    createSearchAnalyticsRow({ page: `/page-${i}` })
  );

  mockGSCClient.fetchSearchAnalytics.mockResolvedValueOnce(rows);

  await engine.sync({ siteUrl: "sc-domain:example.com" });

  // Should call insert exactly 3 times
  expect(mockDb.insert).toHaveBeenCalledTimes(3);

  // Each call should have ≤500 values
  mockDb.insert.mock.calls.forEach(call => {
    expect(call[0].length).toBeLessThanOrEqual(500);
  });
});
```

---

*Testing analysis: 2026-02-22*

## Next Steps

1. **Choose testing framework**: Recommend Vitest for ESM support and monorepo optimization
2. **Install dependencies**: `vitest`, `@vitest/ui`, `@testing-library/react` (if needed), `@types/vitest`
3. **Set up Vitest config** per package: `vitest.config.ts`
4. **Create test fixtures** for common test data
5. **Establish CI testing**: Add to GitHub Actions `.github/workflows/test.yml`
6. **Implement critical tests first**: Decay detection, URL matching, sync engine error paths
