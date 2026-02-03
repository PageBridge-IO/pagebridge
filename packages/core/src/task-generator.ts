import type { SanityClient } from "@sanity/client";
import type { DrizzleClient } from "@content-keep/db";
import { queryAnalytics } from "@content-keep/db";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import type { DecaySignal } from "./decay-detector.js";
import type { MatchResult } from "./url-matcher.js";

export interface QueryContext {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
}

export interface TaskGeneratorOptions {
  sanity: SanityClient;
  db?: DrizzleClient;
}

export class TaskGenerator {
  private sanity: SanityClient;
  private db?: DrizzleClient;

  constructor(options: TaskGeneratorOptions | SanityClient) {
    // Support both old (SanityClient) and new (options object) signatures
    if ("fetch" in options) {
      this.sanity = options;
    } else {
      this.sanity = options.sanity;
      this.db = options.db;
    }
  }

  async createTasks(
    siteId: string,
    signals: DecaySignal[],
    matches: MatchResult[],
    siteUrl?: string,
  ): Promise<number> {
    let created = 0;

    // Get siteUrl from Sanity if not provided (needed for query lookup)
    let resolvedSiteUrl = siteUrl;
    if (!resolvedSiteUrl && this.db) {
      const siteDoc = await this.sanity.fetch<{ siteUrl: string } | null>(
        `*[_type == "gscSite" && _id == $siteId][0]{ siteUrl }`,
        { siteId },
      );
      resolvedSiteUrl = siteDoc?.siteUrl;
    }

    for (const signal of signals) {
      const match = matches.find((m) => m.gscUrl === signal.page);
      if (!match?.sanityId) continue;

      const existingTask = await this.sanity.fetch(
        `*[_type == "gscRefreshTask" && linkedDocument._ref == $docId && status in ["open", "in_progress"]][0]._id`,
        { docId: match.sanityId },
      );

      if (existingTask) continue;

      // Fetch top queries for this page if database is available
      let queryContext: QueryContext[] | undefined;
      if (this.db && resolvedSiteUrl) {
        queryContext = await this.getTopQueries(resolvedSiteUrl, signal.page);
      }

      await this.sanity.create({
        _type: "gscRefreshTask",
        site: { _type: "reference", _ref: siteId },
        linkedDocument: { _type: "reference", _ref: match.sanityId },
        reason: signal.reason,
        severity: signal.severity,
        status: "open",
        metrics: {
          positionBefore: signal.metrics.positionBefore,
          positionNow: signal.metrics.positionNow,
          positionDelta: signal.metrics.positionDelta,
          ctrBefore: signal.metrics.ctrBefore,
          ctrNow: signal.metrics.ctrNow,
          impressions: signal.metrics.impressions,
        },
        ...(queryContext && queryContext.length > 0 && { queryContext }),
        createdAt: new Date().toISOString(),
      });

      created++;
    }

    return created;
  }

  private async getTopQueries(
    siteId: string,
    page: string,
    limit = 5,
  ): Promise<QueryContext[]> {
    if (!this.db) return [];

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 28);

    const results = await this.db
      .select({
        query: queryAnalytics.query,
        totalClicks: sql<number>`sum(${queryAnalytics.clicks})`,
        totalImpressions: sql<number>`sum(${queryAnalytics.impressions})`,
        avgPosition: sql<number>`avg(${queryAnalytics.position})`,
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
      .groupBy(queryAnalytics.query)
      .orderBy(desc(sql`sum(${queryAnalytics.impressions})`))
      .limit(limit);

    return results.map((r) => ({
      query: r.query,
      clicks: Number(r.totalClicks) || 0,
      impressions: Number(r.totalImpressions) || 0,
      position: Number(r.avgPosition) || 0,
    }));
  }

  async updateTaskStatus(
    taskId: string,
    status: "open" | "snoozed" | "in_progress" | "done" | "dismissed",
    options?: { snoozeDays?: number; notes?: string },
  ): Promise<void> {
    const patch: Record<string, unknown> = { status };

    if (status === "snoozed" && options?.snoozeDays) {
      const until = new Date();
      until.setDate(until.getDate() + options.snoozeDays);
      patch.snoozedUntil = until.toISOString();
    }

    if (status === "done" || status === "dismissed") {
      patch.resolvedAt = new Date().toISOString();
    }

    if (options?.notes) {
      patch.notes = options.notes;
    }

    await this.sanity.patch(taskId).set(patch).commit();
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}
