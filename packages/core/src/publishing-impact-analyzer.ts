import type { DrizzleClient } from "@pagebridge/db";
import { searchAnalytics } from "@pagebridge/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { PublishingImpact } from "./sync-engine.js";
import { formatDate } from "./utils/date-utils.js";

export interface EditDateInfo {
  url: string;
  editedAt: Date;
}

export class PublishingImpactAnalyzer {
  constructor(private db: DrizzleClient) {}

  /**
   * Compares 14-day window before vs. 14-day window after the last content edit.
   * Requires at least 7 days since edit to have meaningful "after" data.
   *
   * Note: `editDates` typically comes from Sanity's `_updatedAt` field, which
   * includes ALL document updates (not just content edits). This means schema
   * migrations, metadata changes, or SEO field updates will also trigger a
   * before/after comparison. For more accurate results, pass a dedicated
   * `contentLastEditedAt` field if available.
   */
  async analyze(
    siteId: string,
    editDates: Map<string, Date>,
  ): Promise<Map<string, PublishingImpact>> {
    const results = new Map<string, PublishingImpact>();
    const now = new Date();

    for (const [page, editDate] of editDates) {
      const daysSinceEdit = Math.floor(
        (now.getTime() - editDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Need at least 7 days of post-edit data
      if (daysSinceEdit < 7) continue;

      const beforeStart = new Date(editDate);
      beforeStart.setDate(beforeStart.getDate() - 14);
      const beforeEnd = new Date(editDate);

      const afterStart = new Date(editDate);
      const afterEnd = new Date(editDate);
      afterEnd.setDate(
        afterEnd.getDate() + Math.min(14, daysSinceEdit),
      );

      const [beforeMetrics, afterMetrics] = await Promise.all([
        this.getWindowMetrics(siteId, page, beforeStart, beforeEnd),
        this.getWindowMetrics(siteId, page, afterStart, afterEnd),
      ]);

      if (!beforeMetrics || !afterMetrics) continue;

      results.set(page, {
        lastEditedAt: editDate.toISOString(),
        daysSinceEdit,
        positionBefore: beforeMetrics.position,
        positionAfter: afterMetrics.position,
        positionDelta: afterMetrics.position - beforeMetrics.position,
        clicksBefore: beforeMetrics.clicks,
        clicksAfter: afterMetrics.clicks,
        impressionsBefore: beforeMetrics.impressions,
        impressionsAfter: afterMetrics.impressions,
        ctrBefore: beforeMetrics.ctr,
        ctrAfter: afterMetrics.ctr,
      });
    }

    return results;
  }

  private async getWindowMetrics(
    siteId: string,
    page: string,
    startDate: Date,
    endDate: Date,
  ): Promise<
    | { clicks: number; impressions: number; ctr: number; position: number }
    | undefined
  > {
    const rows = await this.db
      .select({
        totalClicks: sql<number>`sum(${searchAnalytics.clicks})`,
        totalImpressions: sql<number>`sum(${searchAnalytics.impressions})`,
        avgPosition: sql<number>`avg(${searchAnalytics.position})`,
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

    const row = rows[0];
    if (!row) return undefined;

    const clicks = Number(row.totalClicks) || 0;
    const impressions = Number(row.totalImpressions) || 0;
    const position = Number(row.avgPosition) || 0;

    if (impressions === 0) return undefined;

    return {
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position,
    };
  }
}
