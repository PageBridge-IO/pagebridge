import type { DrizzleClient } from "@gsc-sanity/db";
import { searchAnalytics, queryAnalytics, syncLog } from "@gsc-sanity/db";
import { and, eq, gte, lte } from "drizzle-orm";
import type { SanityClient } from "@sanity/client";
import type { GSCClient } from "./gsc-client.js";

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
    siteUrl: string,
    matches: { gscUrl: string; sanityId: string | undefined }[],
  ): Promise<void> {
    const periods = ["last7", "last28", "last90"] as const;
    const periodDays = { last7: 7, last28: 28, last90: 90 };

    for (const period of periods) {
      const startDate = daysAgo(periodDays[period]);
      const endDate = daysAgo(3);

      for (const match of matches) {
        if (!match.sanityId) continue;

        const metrics = await this.getAggregatedMetrics(
          siteUrl,
          match.gscUrl,
          startDate,
          endDate,
        );
        if (!metrics) continue;

        const topQueries = await this.getTopQueries(
          siteUrl,
          match.gscUrl,
          startDate,
          endDate,
        );

        const existingSnapshot = await this.sanity.fetch(
          `*[_type == "gscSnapshot" && site._ref == $siteId && page == $page && period == $period][0]._id`,
          { siteId: siteUrl, page: match.gscUrl, period },
        );

        const snapshotData = {
          _type: "gscSnapshot",
          site: { _type: "reference", _ref: siteUrl },
          page: match.gscUrl,
          linkedDocument: { _type: "reference", _ref: match.sanityId },
          period,
          clicks: metrics.clicks,
          impressions: metrics.impressions,
          ctr: metrics.ctr,
          position: metrics.position,
          topQueries,
          fetchedAt: new Date().toISOString(),
        };

        if (existingSnapshot) {
          await this.sanity.patch(existingSnapshot).set(snapshotData).commit();
        } else {
          await this.sanity.create(snapshotData);
        }
      }
    }
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
