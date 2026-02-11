import type { DrizzleClient } from "@pagebridge/db";
import { searchAnalytics } from "@pagebridge/db";
import { and, eq, gte, lte } from "drizzle-orm";
import type { DailyMetricPoint } from "./sync-engine.js";
import { daysAgo, formatDate } from "./utils/date-utils.js";

export class DailyMetricsCollector {
  constructor(private db: DrizzleClient) {}

  /**
   * Collects 28 days of daily metrics per page for sparkline charts.
   * Returns a Map keyed by page URL.
   */
  async collect(siteId: string): Promise<Map<string, DailyMetricPoint[]>> {
    const startDate = daysAgo(31); // extra days for buffer
    const endDate = daysAgo(3);

    const results = await this.db
      .select({
        page: searchAnalytics.page,
        date: searchAnalytics.date,
        clicks: searchAnalytics.clicks,
        impressions: searchAnalytics.impressions,
        position: searchAnalytics.position,
      })
      .from(searchAnalytics)
      .where(
        and(
          eq(searchAnalytics.siteId, siteId),
          gte(searchAnalytics.date, formatDate(startDate)),
          lte(searchAnalytics.date, formatDate(endDate)),
        ),
      );

    const map = new Map<string, DailyMetricPoint[]>();

    for (const row of results) {
      const existing = map.get(row.page) ?? [];
      existing.push({
        date: row.date,
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        position: row.position ?? 0,
      });
      map.set(row.page, existing);
    }

    // Sort each page's points by date
    for (const [page, points] of map) {
      points.sort((a, b) => a.date.localeCompare(b.date));
      // Keep last 28 points
      if (points.length > 28) {
        map.set(page, points.slice(-28));
      }
    }

    return map;
  }
}
