import type { DrizzleClient } from "@pagebridge/db";
import {
  searchAnalytics,
  queryAnalytics,
  syncLog,
  pageIndexStatus,
} from "@pagebridge/db";
import { and, eq, gte, lte } from "drizzle-orm";
import type { SanityClient } from "@sanity/client";
import type { GSCClient, IndexStatusResult } from "./gsc-client.js";

export interface SyncOptions {
  siteUrl: string;
  startDate?: Date;
  endDate?: Date;
  dimensions?: ("page" | "query" | "date")[];
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
      dimensions = ["page", "date"],
    } = options;

    const syncLogId = `${siteUrl}:${Date.now()}`;

    await this.db.insert(syncLog).values({
      id: syncLogId,
      siteId: siteUrl,
      startedAt: new Date(),
      status: "running",
    });

    try {
      const rows = await this.gsc.fetchSearchAnalytics({
        siteUrl,
        startDate,
        endDate,
        dimensions,
      });

      const pages = new Set<string>();

      for (const row of rows) {
        pages.add(row.page);

        if (row.date) {
          const id = `${siteUrl}:${row.page}:${row.date}`;
          await this.db
            .insert(searchAnalytics)
            .values({
              id,
              siteId: siteUrl,
              page: row.page,
              date: row.date,
              clicks: row.clicks,
              impressions: row.impressions,
              ctr: row.ctr,
              position: row.position,
            })
            .onConflictDoUpdate({
              target: searchAnalytics.id,
              set: {
                clicks: row.clicks,
                impressions: row.impressions,
                ctr: row.ctr,
                position: row.position,
                fetchedAt: new Date(),
              },
            });
        }

        if (row.query && row.date) {
          const id = `${siteUrl}:${row.page}:${row.query}:${row.date}`;
          await this.db
            .insert(queryAnalytics)
            .values({
              id,
              siteId: siteUrl,
              page: row.page,
              query: row.query,
              date: row.date,
              clicks: row.clicks,
              impressions: row.impressions,
              ctr: row.ctr,
              position: row.position,
            })
            .onConflictDoUpdate({
              target: queryAnalytics.id,
              set: {
                clicks: row.clicks,
                impressions: row.impressions,
                ctr: row.ctr,
                position: row.position,
              },
            });
        }
      }

      await this.db
        .update(syncLog)
        .set({
          status: "completed",
          completedAt: new Date(),
          rowsProcessed: rows.length,
        })
        .where(eq(syncLog.id, syncLogId));

      return {
        pages: Array.from(pages),
        rowsProcessed: rows.length,
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
  ): Promise<void> {
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

    const periods = ["last7", "last28", "last90"] as const;
    const periodDays = { last7: 7, last28: 28, last90: 90 };

    for (const period of periods) {
      const startDate = daysAgo(periodDays[period]);
      const endDate = daysAgo(3);

      for (const match of matches) {
        if (!match.sanityId) continue;

        const metrics = await this.getAggregatedMetrics(
          resolvedSiteUrl,
          match.gscUrl,
          startDate,
          endDate,
        );
        if (!metrics) continue;

        const topQueries = await this.getTopQueries(
          resolvedSiteUrl,
          match.gscUrl,
          startDate,
          endDate,
        );

        // Get index status from database
        const indexStatusData = await this.getIndexStatus(
          resolvedSiteUrl,
          match.gscUrl,
        );

        const existingSnapshot = await this.sanity.fetch(
          `*[_type == "gscSnapshot" && site._ref == $siteId && page == $page && period == $period][0]._id`,
          { siteId, page: match.gscUrl, period },
        );

        const snapshotData = {
          _type: "gscSnapshot" as const,
          site: { _type: "reference" as const, _ref: siteId },
          page: match.gscUrl,
          linkedDocument: { _type: "reference" as const, _ref: match.sanityId },
          period,
          clicks: metrics.clicks,
          impressions: metrics.impressions,
          ctr: metrics.ctr,
          position: metrics.position,
          topQueries,
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

        if (existingSnapshot) {
          await this.sanity.patch(existingSnapshot).set(snapshotData).commit();
        } else {
          await this.sanity.create(snapshotData);
        }
      }
    }
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
