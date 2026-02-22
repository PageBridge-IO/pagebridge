# Codebase Concerns

**Analysis Date:** 2026-02-22

## Tech Debt

**Deprecated URL Configuration Format:**
- Issue: Old `contentTypes`, `slugField`, `pathPrefix` fields in Sanity schema kept for backward compatibility but should be migrated to new `urlConfigs` format
- Files: `packages/sanity-plugin/src/schemas/gscSite.ts`, `apps/cli/src/normalize-url-configs.ts`, `packages/core/src/url-matcher.ts`
- Impact: Users see deprecation warnings; multiple config paths increase cognitive load and maintenance burden; eventual breaking changes when deprecated format is removed
- Fix approach: Send migration notices to users via CLI output; add explicit migration guide in docs; set timeline for removing old format (e.g., v1.0 release)

**Publishing Impact Analysis Relies on _updatedAt:**
- Issue: `PublishingImpactAnalyzer` uses Sanity's `_updatedAt` field to detect content edits, but this includes ALL document updates (schema changes, metadata edits), not just content edits
- Files: `apps/cli/src/commands/sync.ts` (lines 574-599), `packages/core/src/publishing-impact-analyzer.ts`
- Impact: Metrics can be inaccurate when content hasn't truly changed but document was modified; makes publishing impact analysis unreliable
- Fix approach: Recommend users add dedicated `contentLastEditedAt` field to their Sanity schemas for precise tracking; update documentation with this pattern; add warning message when field is missing

**GSCClient and SyncEngine HTTP Connections Never Close:**
- Issue: Sanity client and GSC client (googleapis library) keep HTTP connections alive with no close() API; process.exit() is forced at end of sync command
- Files: `apps/cli/src/commands/sync.ts` (lines 548-550)
- Impact: Unclean shutdown; prevents graceful connection cleanup; could leave dangling connections in containerized environments
- Fix approach: Check if google-auth-library has a disconnect method; consider wrapping clients with connection pooling; document this limitation for users deploying to serverless environments

## Known Bugs

**Index Status Checking Has Silent Failures:**
- Symptoms: When checking Google index status for pages, individual page failures are silently caught and logged to console only, not tracked in sync status
- Files: `packages/core/src/sync-engine.ts` (lines 525-528)
- Trigger: Run sync with `--check-index` flag on a site with indexing API quota exceeded or permission errors
- Workaround: Check console output for error messages; use `--debug` flag to see timing of failed checks
- Fix: Track and report failed index status checks in sync result; add explicit error count to sync completion message

**Unmatched URL Diagnostics Store Stringified JSON:**
- Symptoms: Similar slugs array is stored as JSON string in database, not as structured data
- Files: `apps/cli/src/commands/sync.ts` (lines 299-301, 313-315)
- Trigger: Any sync with unmatched URLs
- Workaround: Manual JSON parsing when reading diagnostics from database
- Fix: Consider storing as JSONB type in PostgreSQL schema or create separate junction table for similar slugs

## Security Considerations

**Service Account Credentials Passed as CLI Arguments:**
- Risk: `--google-service-account` JSON can appear in process argument list, visible via `ps` or shell history
- Files: `apps/cli/src/commands/sync.ts` (lines 52, 81-84, 147-154)
- Current mitigation: Documentation recommends using environment variables; CLI accepts both `--google-service-account` flag and `GOOGLE_SERVICE_ACCOUNT` env var
- Recommendations: Add explicit warning in help text about not using `--google-service-account` with sensitive credentials; consider reading from stdin as alternative; audit shell history practices in deployment docs

**Database Credentials in DATABASE_URL:**
- Risk: PostgreSQL connection string contains password and is passed as environment variable or CLI argument
- Files: `apps/cli/src/commands/sync.ts` (lines 53, 85, 145)
- Current mitigation: Recommended approach is environment variables only
- Recommendations: Document this as a security requirement, not optional; consider validation that DATABASE_URL is not passed via CLI flag; add checks in CI/CD to prevent credentials in logs

**No Rate Limiting on Sanity Mutations:**
- Risk: writeSnapshots creates transactions with many mutations (3 periods × pages × array items); no backoff if Sanity API rate limits are hit
- Files: `packages/core/src/sync-engine.ts` (lines 310-451)
- Current mitigation: None
- Recommendations: Add exponential backoff for Sanity transaction commit failures; implement batch size limits for mutation counts; add metrics/warnings when approaching rate limits

## Performance Bottlenecks

**URL Matching Loads All Documents into Memory:**
- Problem: `URLMatcher.matchUrls()` fetches all documents for each content type and builds in-memory maps before matching
- Files: `packages/core/src/url-matcher.ts` (lines 89-125)
- Cause: Single query per content type returns all results; no pagination or streaming
- Improvement path: Add pagination in Sanity queries if document count > 5000; consider index building in background; implement Levenshtein distance calculation only for unmatched slugs instead of all slugs

**Levenshtein Distance Calculation for Every Unmatched URL:**
- Problem: Similarity scoring runs O(n*m) string distance on every unmatched URL against all available slugs
- Files: `packages/core/src/url-matcher.ts` (lines 325-374)
- Cause: No caching or limit on candidates before scoring
- Improvement path: Pre-filter candidates by length similarity before running full distance calculation; limit to top N candidates; consider approximate nearest-neighbor algorithms

**Sync Command Blocks on Multiple Sequential Insight Analyses:**
- Problem: Quick wins, CTR anomalies, daily metrics, publishing impact, and cannibalization analyses run sequentially with error wrapping but no parallelization within insight phase
- Files: `apps/cli/src/commands/sync.ts` (lines 392-523)
- Cause: Each analyzer runs independently; some analyzers do similar database queries
- Improvement path: Run independent analyzers in parallel; consolidate overlapping database queries (all use `searchAnalytics` or `queryAnalytics` table)

**Unmatched Diagnostics Stored in Loop:**
- Problem: Each unmatched URL is inserted/updated individually in database with separate SQL statement
- Files: `apps/cli/src/commands/sync.ts` (lines 286-319)
- Cause: Loop executes `db.insert().onConflictDoUpdate()` per URL
- Improvement path: Batch all unmatched URLs and execute single multi-row insert; reduces database roundtrips significantly

## Fragile Areas

**URL Normalization in Three Different Places:**
- Files: `packages/core/src/url-matcher.ts` (lines 259-320)
- Why fragile: `normalizeUrl()`, `normalizeSlug()`, and URL parsing with try/catch appear multiple times; inconsistent logic could cause subtle matching failures
- Safe modification: Centralize all normalization in single utility function with unit tests; verify all callers use same function; test with edge cases (international domains, encoded characters, trailing slashes)
- Test coverage: URL matching has basic logic tests but no edge case coverage for unusual URL patterns

**IndexStatusResult Type Casting:**
- Files: `packages/core/src/sync-engine.ts` (lines 549, 671-683)
- Why fragile: Casting `row.verdict as IndexStatusResult["verdict"]` without validation; mapVerdictToSanity() has unexhaustive switch (default case)
- Safe modification: Add type guard function to validate verdict string is one of expected values; make switch exhaustive with TypeScript `never` type
- Test coverage: No unit tests for verdict mapping

**TaskGenerator Constructor Overloading:**
- Files: `packages/core/src/task-generator.ts` (lines 24-31)
- Why fragile: Accepts both old `(SanityClient)` and new `(TaskGeneratorOptions)` signatures using duck typing (`"fetch" in options`)
- Safe modification: Deprecate old signature; warn users in two releases before removing; add explicit type checking with proper error messages
- Test coverage: No tests for constructor overloading behavior

**Sync Command Shutdown Handler Race Condition:**
- Files: `apps/cli/src/commands/sync.ts` (lines 159-166, 193-194, 546)
- Why fragile: Shutdown handlers registered but can be removed twice or process.exit(130) can race with finally block
- Safe modification: Use a guard variable to ensure cleanup runs exactly once; ensure process.exit() in finally block is not double-called
- Test coverage: No tests for shutdown signal handling

## Scaling Limits

**Database Query Without Row Limit in QuickWinAnalyzer:**
- Current capacity: Works fine for <100k query records per site
- Limit: Large sites with millions of query records could return full result set into memory before filtering
- Scaling path: Add LIMIT clause to Drizzle query before groupBy; process results in batches if needed; add pagination

**URL Matching Memory Usage Scales with Document Count:**
- Current capacity: Tested with <5k documents per content type
- Limit: Sites with >50k total documents could cause memory pressure when building slug maps
- Scaling path: Implement streaming/batched Sanity queries; consider building indexes in background service; use database-backed lookups instead of in-memory maps

**Sanity Transaction Mutation Count:**
- Current capacity: Safe up to ~1k mutations per transaction (3 periods × ~300 matched pages)
- Limit: Sites with >10k matched pages could exceed Sanity API limits for single transaction
- Scaling path: Split snapshots into smaller transactions (100-200 mutations per tx); implement retry logic with exponential backoff; monitor API response times

**GSC API Row Limits:**
- Current capacity: 25k rows per dimension set; pagination handles this
- Limit: Sites with >500k unique page/query combinations could face API quota exhaustion
- Scaling path: Implement date range splitting if row count == rowLimit; add quota tracking; allow users to configure pageAnalyticsRowLimit

## Dependencies at Risk

**googleapis Library Version (v171.1.0):**
- Risk: Major version bump from v170; Google API surface changes frequently
- Impact: Breaking changes in searchconsole API client could break sync
- Migration plan: Monitor googleapis releases; test new versions in isolated environment before upgrading; pin version in package.json with minor version lock

**Sanity Client Missing Close Method:**
- Risk: No way to properly close HTTP connections; relies on process exit
- Impact: Unclean shutdown in containerized/serverless environments; possible memory leaks
- Migration plan: Monitor Sanity client releases for connection pooling improvements; consider using node HTTP agent with connection pooling at Node.js level

**Drizzle ORM at 0.45.1 (Pre-1.0):**
- Risk: Pre-release version; breaking API changes possible in minor versions
- Impact: Schema migrations, query patterns could break
- Migration plan: Lock to patch version (`^0.45.1`); test migrations in CI before upgrading; monitor Drizzle 1.0 release candidate

## Missing Critical Features

**No Sync Resumption/Checkpointing:**
- Problem: If sync fails midway, rerunning will re-process and re-write all snapshots for successfully matched pages
- Blocks: Unreliable long-running syncs on large sites; wasted API calls on retry
- Recommendation: Implement sync checkpointing: track which pages had snapshots successfully written; skip already-completed pages on retry; store checkpoint in database

**No Dry-Run for Insight Analysis:**
- Problem: `--dry-run` flag skips insight analysis entirely; users can't preview what insights will be generated
- Blocks: Users can't validate insight configurations before running full sync
- Recommendation: Extend dry-run to show sample insights (top 5 quick wins, example anomalies); print what would be written to Sanity

**Limited Error Recovery:**
- Problem: Individual insight analysis failures are caught and silently reset to empty maps
- Blocks: Users don't know which analyses failed; can't retry specific analyses
- Recommendation: Store failed analysis names in sync log; allow users to re-run specific analyses; add explicit error counts to final report

## Test Coverage Gaps

**No Tests for URL Matching Edge Cases:**
- What's not tested: Internationalized domain names (IDN), percent-encoded URLs, URLs with unusual characters, multiple trailing slashes
- Files: `packages/core/src/url-matcher.ts`
- Risk: Matching fails silently for URLs with non-ASCII characters or encoding variations
- Priority: High — affects all users with non-English content or URLs

**No Tests for Sync Command Graceful Shutdown:**
- What's not tested: SIGTERM/SIGINT handling, connection cleanup, database closure
- Files: `apps/cli/src/commands/sync.ts`
- Risk: Process hangs or leaves orphaned connections on production shutdown
- Priority: High — production reliability concern

**No Tests for IndexStatusResult Verdict Mapping:**
- What's not tested: All possible verdict values from Google API are correctly mapped to Sanity values
- Files: `packages/core/src/sync-engine.ts` (mapVerdictToSanity function)
- Risk: Unknown verdict values silently map to "not_indexed"
- Priority: Medium — affects index status reporting accuracy

**Limited Integration Tests for Full Sync Flow:**
- What's not tested: End-to-end sync with real (or mocked) GSC and Sanity APIs
- Files: `apps/cli/src/commands/sync.ts` (entire command)
- Risk: Regressions in multi-service coordination not caught until production
- Priority: Medium — important but high setup cost

**No Performance Tests for Large Datasets:**
- What's not tested: Matching behavior with >10k documents, sync with >50k GSC pages, insight analysis at scale
- Files: Multiple core files
- Risk: Performance problems discovered by users in production
- Priority: Medium — needed before scaling to large sites

---

*Concerns audit: 2026-02-22*
