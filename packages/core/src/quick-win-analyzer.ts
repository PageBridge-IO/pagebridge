import type { DrizzleClient } from "@pagebridge/db";
import { queryAnalytics } from "@pagebridge/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export interface QuickWinQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface QuickWinConfig {
  /** Minimum average position to qualify (default: 8) */
  positionMin: number;
  /** Maximum average position to qualify (default: 20) */
  positionMax: number;
  /** Minimum total impressions to qualify (default: 50) */
  minImpressions: number;
  /** Maximum quick wins per page (default: 10) */
  maxPerPage: number;
}

const defaultConfig: QuickWinConfig = {
  positionMin: 8,
  positionMax: 20,
  minImpressions: 50,
  maxPerPage: 10,
};

export class QuickWinAnalyzer {
  private config: QuickWinConfig;

  constructor(
    private db: DrizzleClient,
    config?: Partial<QuickWinConfig>,
  ) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Finds "quick win" queries for all pages: queries where position is 8-20
   * with significant impressions. These are page-1 opportunities where a small
   * content tweak could improve ranking.
   */
  async analyze(siteId: string): Promise<Map<string, QuickWinQuery[]>> {
    const startDate = daysAgo(28);
    const endDate = daysAgo(3);

    const results = await this.db
      .select({
        page: queryAnalytics.page,
        query: queryAnalytics.query,
        totalClicks: sql<number>`sum(${queryAnalytics.clicks})`,
        totalImpressions: sql<number>`sum(${queryAnalytics.impressions})`,
        avgPosition: sql<number>`avg(${queryAnalytics.position})`,
      })
      .from(queryAnalytics)
      .where(
        and(
          eq(queryAnalytics.siteId, siteId),
          gte(queryAnalytics.date, formatDate(startDate)),
          lte(queryAnalytics.date, formatDate(endDate)),
        ),
      )
      .groupBy(queryAnalytics.page, queryAnalytics.query);

    const quickWins = new Map<string, QuickWinQuery[]>();

    for (const row of results) {
      const position = Number(row.avgPosition) || 0;
      const impressions = Number(row.totalImpressions) || 0;
      const clicks = Number(row.totalClicks) || 0;

      if (
        position < this.config.positionMin ||
        position > this.config.positionMax ||
        impressions < this.config.minImpressions
      ) {
        continue;
      }

      const entry: QuickWinQuery = {
        query: row.query,
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        position,
      };

      const existing = quickWins.get(row.page) ?? [];
      existing.push(entry);
      quickWins.set(row.page, existing);
    }

    // Sort by impressions desc and cap per page
    for (const [page, queries] of quickWins) {
      queries.sort((a, b) => b.impressions - a.impressions);
      if (queries.length > this.config.maxPerPage) {
        quickWins.set(page, queries.slice(0, this.config.maxPerPage));
      }
    }

    return quickWins;
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
