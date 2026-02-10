import type { DrizzleClient } from "@pagebridge/db";
import {
  searchAnalytics,
  queryAnalytics,
  syncLog,
  pageIndexStatus,
} from "@pagebridge/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { SanityClient } from "@sanity/client";
import type { GSCClient, IndexStatusResult } from "./gsc-client.js";
import type { QuickWinQuery } from "./quick-win-analyzer.js";

export interface SyncOptions {
  siteUrl: string;
  startDate?: Date;
  endDate?: Date;
  dimensions?: ("page" | "query" | "date")[];
  onProgress?: (message: string) => void;
}

export interface SyncResult {
  pages: string[];
  rowsProcessed: number;
  syncLogId: string;
}

export interface IndexStatusSyncResult {
  checked: number;
  indexed: number;
  notIndexed: number;
  skipped: number;
}

export interface SyncEngineOptions {
  gsc: GSCClient;
  db: DrizzleClient;
  sanity: SanityClient;
}

export class SyncEngine {
  private gsc: GSCClient;
  private db: DrizzleClient;
  private sanity: SanityClient;

  constructor(options: SyncEngineOptions) {
    this.gsc = options.gsc;
    this.db = options.db;
    this.sanity = options.sanity;
  }

  async sync(options: SyncOptions): Promise<SyncResult> {
    const {
      siteUrl,
      startDate = daysAgo(90),
      endDate = daysAgo(3),
      dimensions = ["page", "query", "date"],
      onProgress,
    } = options;

    const progress = onProgress ?? (() => {});
    const syncLogId = `${siteUrl}:${Date.now()}`;

    await this.db.insert(syncLog).values({
      id: syncLogId,
      siteId: siteUrl,
      startedAt: new Date(),
      status: "running",
    });

    try {
      // Fetch page-level and query-level data in parallel
      const fetchQuery = dimensions.includes("query");

      progress("Fetching data from Google Search Console...");

      const [pageRows, queryRows] = await Promise.all([
        this.gsc.fetchSearchAnalytics({
          siteUrl,
          startDate,
          endDate,
          dimensions: ["page", "date"],
        }),
        fetchQuery
          ? this.gsc.fetchSearchAnalytics({
              siteUrl,
              startDate,
              endDate,
              dimensions: ["page", "query", "date"],
            })
          : Promise.resolve([]),
      ]);

      progress(
        `Fetched ${pageRows.length} page rows` +
          (fetchQuery ? ` and ${queryRows.length} query rows` : "") +
          ` from GSC`,
      );

      const pages = new Set<string>();
      for (const row of pageRows) pages.add(row.page);
      for (const row of queryRows) pages.add(row.page);

      const BATCH_SIZE = 500;

      // Write page-level data to search_analytics
      const pageValues = pageRows
        .filter((row) => row.date)
        .map((row) => ({
          id: `${siteUrl}:${row.page}:${row.date}`,
          siteId: siteUrl,
          page: row.page,
          date: row.date!,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        }));

      for (let i = 0; i < pageValues.length; i += BATCH_SIZE) {
        const batch = pageValues.slice(i, i + BATCH_SIZE);
        await this.db
          .insert(searchAnalytics)
          .values(batch)
          .onConflictDoUpdate({
            target: searchAnalytics.id,
            set: {
              clicks: sql`excluded.clicks`,
              impressions: sql`excluded.impressions`,
              ctr: sql`excluded.ctr`,
              position: sql`excluded.position`,
              fetchedAt: new Date(),
            },
          });
        progress(
          `Writing page data... ${Math.min(i + BATCH_SIZE, pageValues.length)}/${pageValues.length} rows`,
        );
      }

      if (pageValues.length > 0) {
        progress(`Wrote ${pageValues.length} page rows to database`);
      }

      // Write query-level data to query_analytics
      const queryValues = queryRows
        .filter((row) => row.query && row.date)
        .map((row) => ({
          id: `${siteUrl}:${row.page}:${row.query}:${row.date}`,
          siteId: siteUrl,
          page: row.page,
          query: row.query!,
          date: row.date!,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        }));

      for (let i = 0; i < queryValues.length; i += BATCH_SIZE) {
        const batch = queryValues.slice(i, i + BATCH_SIZE);
        await this.db
          .insert(queryAnalytics)
          .values(batch)
          .onConflictDoUpdate({
            target: queryAnalytics.id,
            set: {
              clicks: sql`excluded.clicks`,
              impressions: sql`excluded.impressions`,
              ctr: sql`excluded.ctr`,
              position: sql`excluded.position`,
            },
          });
        progress(
          `Writing query data... ${Math.min(i + BATCH_SIZE, queryValues.length)}/${queryValues.length} rows`,
        );
      }

      if (queryValues.length > 0) {
        progress(`Wrote ${queryValues.length} query rows to database`);
      }

      const totalRows = pageRows.length + queryRows.length;

      await this.db
        .update(syncLog)
        .set({
          status: "completed",
          completedAt: new Date(),
          rowsProcessed: totalRows,
        })
        .where(eq(syncLog.id, syncLogId));

      return {
        pages: Array.from(pages),
        rowsProcessed: totalRows,
        syncLogId,
      };
    } catch (error) {
      await this.db
        .update(syncLog)
        .set({
          status: "failed",
          completedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
        })
        .where(eq(syncLog.id, syncLogId));

      throw error;
    }
  }

  async writeSnapshots(
    siteId: string,
    matches: { gscUrl: string; sanityId: string | undefined }[],
    siteUrl?: string,
    insights?: {
      quickWins?: Map<string, QuickWinQuery[]>;
    },
    onProgress?: (message: string) => void,
  ): Promise<void> {
    const progress = onProgress ?? (() => {});

    // Get the siteUrl from Sanity if not provided
    let resolvedSiteUrl = siteUrl;
    if (!resolvedSiteUrl) {
      const siteDoc = await this.sanity.fetch<{ siteUrl: string } | null>(
        `*[_type == "gscSite" && _id == $siteId][0]{ siteUrl }`,
        { siteId },
      );
      resolvedSiteUrl = siteDoc?.siteUrl;
    }
    if (!resolvedSiteUrl) {
      throw new Error(`Could not find siteUrl for site ID: ${siteId}`);
    }

    const validMatches = matches.filter((m) => m.sanityId);

    // Pre-fetch all existing snapshot IDs in one query
    progress(`Checking existing snapshots for ${validMatches.length} pages...`);
    const existingSnapshots = await this.sanity.fetch<
      { _id: string; page: string; period: string }[]
    >(
      `*[_type == "gscSnapshot" && site._ref == $siteId]{ _id, page, period }`,
      { siteId },
    );

    const snapshotIdMap = new Map<string, string>();
    for (const snap of existingSnapshots) {
      snapshotIdMap.set(`${snap.page}:${snap.period}`, snap._id);
    }

    const periods = ["last7", "last28", "last90"] as const;
    const periodDays = { last7: 7, last28: 28, last90: 90 };

    // Pre-fetch index status for all pages in parallel
    const indexStatusMap = new Map<
      string,
      Awaited<ReturnType<typeof this.getIndexStatus>>
    >();
    await Promise.all(
      validMatches.map(async (match) => {
        const status = await this.getIndexStatus(
          resolvedSiteUrl!,
          match.gscUrl,
        );
        indexStatusMap.set(match.gscUrl, status);
      }),
    );

    // Build all snapshot data, querying DB in parallel per match
    progress(`Computing metrics for ${validMatches.length} pages × ${periods.length} periods...`);

    const transaction = this.sanity.transaction();
    let mutationCount = 0;

    for (const period of periods) {
      const startDate = daysAgo(periodDays[period]);
      const endDate = daysAgo(3);

      // Fetch metrics and top queries in parallel for all matches in this period
      const matchData = await Promise.all(
        validMatches.map(async (match) => {
          const [metrics, topQueries] = await Promise.all([
            this.getAggregatedMetrics(
              resolvedSiteUrl!,
              match.gscUrl,
              startDate,
              endDate,
            ),
            this.getTopQueries(
              resolvedSiteUrl!,
              match.gscUrl,
              startDate,
              endDate,
            ),
          ]);
          return { match, metrics, topQueries };
        }),
      );

      for (const { match, metrics, topQueries } of matchData) {
        if (!metrics) continue;

        const indexStatusData = indexStatusMap.get(match.gscUrl);

        const quickWinQueries =
          period === "last28"
            ? (insights?.quickWins?.get(match.gscUrl) ?? [])
            : [];

        const snapshotData = {
          _type: "gscSnapshot" as const,
          site: { _type: "reference" as const, _ref: siteId },
          page: match.gscUrl,
          linkedDocument: {
            _type: "reference" as const,
            _ref: match.sanityId,
          },
          period,
          clicks: metrics.clicks,
          impressions: metrics.impressions,
          ctr: metrics.ctr,
          position: metrics.position,
          topQueries,
          ...(quickWinQueries.length > 0 ? { quickWinQueries } : {}),
          fetchedAt: new Date().toISOString(),
          indexStatus: indexStatusData
            ? {
                verdict: mapVerdictToSanity(indexStatusData.verdict),
                coverageState: indexStatusData.coverageState,
                lastCrawlTime:
                  indexStatusData.lastCrawlTime?.toISOString() ?? null,
                robotsTxtState: indexStatusData.robotsTxtState,
                pageFetchState: indexStatusData.pageFetchState,
              }
            : undefined,
        };

        const existingId = snapshotIdMap.get(`${match.gscUrl}:${period}`);
        if (existingId) {
          transaction.patch(existingId, (p) => p.set(snapshotData));
        } else {
          transaction.create(snapshotData);
        }
        mutationCount++;
      }
    }

    progress(`Committing ${mutationCount} snapshot mutations...`);
    await transaction.commit();
  }

  async syncIndexStatus(
    siteUrl: string,
    pages: string[],
  ): Promise<IndexStatusSyncResult> {
    const result: IndexStatusSyncResult = {
      checked: 0,
      indexed: 0,
      notIndexed: 0,
      skipped: 0,
    };

    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

    for (const page of pages) {
      const id = `${siteUrl}:${page}`;

      // Check if we already have a recent status
      const existing = await this.db
        .select({ fetchedAt: pageIndexStatus.fetchedAt })
        .from(pageIndexStatus)
        .where(eq(pageIndexStatus.id, id))
        .limit(1);

      if (
        existing.length > 0 &&
        existing[0]?.fetchedAt &&
        Date.now() - existing[0].fetchedAt.getTime() < CACHE_DURATION_MS
      ) {
        result.skipped++;
        continue;
      }

      try {
        const status = await this.gsc.inspectUrl(siteUrl, page);

        await this.db
          .insert(pageIndexStatus)
          .values({
            id,
            siteId: siteUrl,
            page,
            verdict: status.verdict,
            coverageState: status.coverageState,
            indexingState: status.indexingState,
            pageFetchState: status.pageFetchState,
            lastCrawlTime: status.lastCrawlTime,
            robotsTxtState: status.robotsTxtState,
            fetchedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: pageIndexStatus.id,
            set: {
              verdict: status.verdict,
              coverageState: status.coverageState,
              indexingState: status.indexingState,
              pageFetchState: status.pageFetchState,
              lastCrawlTime: status.lastCrawlTime,
              robotsTxtState: status.robotsTxtState,
              fetchedAt: new Date(),
            },
          });

        result.checked++;
        if (status.verdict === "PASS") {
          result.indexed++;
        } else {
          result.notIndexed++;
        }

        // Small delay to respect rate limits (600/min = 100ms between requests)
        await delay(100);
      } catch (error) {
        console.error(`Failed to check index status for ${page}:`, error);
        result.skipped++;
      }
    }

    return result;
  }

  async getIndexStatus(
    siteUrl: string,
    page: string,
  ): Promise<IndexStatusResult | null> {
    const id = `${siteUrl}:${page}`;
    const rows = await this.db
      .select()
      .from(pageIndexStatus)
      .where(eq(pageIndexStatus.id, id))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      verdict: row.verdict as IndexStatusResult["verdict"],
      coverageState: row.coverageState,
      indexingState: row.indexingState,
      pageFetchState: row.pageFetchState,
      lastCrawlTime: row.lastCrawlTime,
      robotsTxtState: row.robotsTxtState,
    };
  }

  private async getAggregatedMetrics(
    siteId: string,
    page: string,
    startDate: Date,
    endDate: Date,
  ): Promise<
    | { clicks: number; impressions: number; ctr: number; position: number }
    | undefined
  > {
    const results = await this.db
      .select({
        totalClicks: searchAnalytics.clicks,
        totalImpressions: searchAnalytics.impressions,
        avgCtr: searchAnalytics.ctr,
        avgPosition: searchAnalytics.position,
      })
      .from(searchAnalytics)
      .where(
        and(
          eq(searchAnalytics.siteId, siteId),
          eq(searchAnalytics.page, page),
          gte(searchAnalytics.date, formatDate(startDate)),
          lte(searchAnalytics.date, formatDate(endDate)),
        ),
      );

    if (results.length === 0) return undefined;

    const totalClicks = results.reduce(
      (sum, r) => sum + (r.totalClicks ?? 0),
      0,
    );
    const totalImpressions = results.reduce(
      (sum, r) => sum + (r.totalImpressions ?? 0),
      0,
    );
    const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
    const avgPosition =
      results.reduce((sum, r) => sum + (r.avgPosition ?? 0), 0) /
      results.length;

    return {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: avgCtr,
      position: avgPosition,
    };
  }

  private async getTopQueries(
    siteId: string,
    page: string,
    startDate: Date,
    endDate: Date,
  ): Promise<
    { query: string; clicks: number; impressions: number; position: number }[]
  > {
    const results = await this.db
      .select({
        query: queryAnalytics.query,
        clicks: queryAnalytics.clicks,
        impressions: queryAnalytics.impressions,
        position: queryAnalytics.position,
      })
      .from(queryAnalytics)
      .where(
        and(
          eq(queryAnalytics.siteId, siteId),
          eq(queryAnalytics.page, page),
          gte(queryAnalytics.date, formatDate(startDate)),
          lte(queryAnalytics.date, formatDate(endDate)),
        ),
      )
      .limit(10);

    const queryMap = new Map<
      string,
      { clicks: number; impressions: number; positions: number[] }
    >();

    for (const row of results) {
      const existing = queryMap.get(row.query);
      if (existing) {
        existing.clicks += row.clicks ?? 0;
        existing.impressions += row.impressions ?? 0;
        existing.positions.push(row.position ?? 0);
      } else {
        queryMap.set(row.query, {
          clicks: row.clicks ?? 0,
          impressions: row.impressions ?? 0,
          positions: [row.position ?? 0],
        });
      }
    }

    return Array.from(queryMap.entries())
      .map(([query, data]) => ({
        query,
        clicks: data.clicks,
        impressions: data.impressions,
        position:
          data.positions.reduce((a, b) => a + b, 0) / data.positions.length,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);
  }
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapVerdictToSanity(
  verdict: string,
): "indexed" | "not_indexed" | "excluded" {
  switch (verdict) {
    case "PASS":
      return "indexed";
    case "NEUTRAL":
      return "excluded";
    case "FAIL":
    default:
      return "not_indexed";
  }
}
