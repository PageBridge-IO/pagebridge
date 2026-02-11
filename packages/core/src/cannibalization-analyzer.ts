import type { DrizzleClient } from "@pagebridge/db";
import { queryAnalytics } from "@pagebridge/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { CannibalizationTarget } from "./sync-engine.js";

export interface CannibalizationGroup {
  query: string;
  pages: {
    page: string;
    clicks: number;
    impressions: number;
    position: number;
  }[];
}

export class CannibalizationAnalyzer {
  constructor(private db: DrizzleClient) {}

  /**
   * Finds queries where 2+ pages rank, grouped by query.
   * Returns site-wide cannibalization groups.
   */
  async analyzeSiteWide(siteId: string): Promise<CannibalizationGroup[]> {
    const startDate = daysAgo(28);
    const endDate = daysAgo(3);

    // Get all query+page combos with significant impressions
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

    // Group by query and filter for queries with 2+ pages
    const queryMap = new Map<
      string,
      { page: string; clicks: number; impressions: number; position: number }[]
    >();

    for (const row of results) {
      const impressions = Number(row.totalImpressions) || 0;
      if (impressions < 100) continue;

      const existing = queryMap.get(row.query) ?? [];
      existing.push({
        page: row.page,
        clicks: Number(row.totalClicks) || 0,
        impressions,
        position: Number(row.avgPosition) || 0,
      });
      queryMap.set(row.query, existing);
    }

    const groups: CannibalizationGroup[] = [];
    for (const [query, pages] of queryMap) {
      if (pages.length >= 2) {
        pages.sort((a, b) => a.position - b.position);
        groups.push({ query, pages });
      }
    }

    // Sort by total impressions across competing pages
    groups.sort((a, b) => {
      const aImpr = a.pages.reduce((s, p) => s + p.impressions, 0);
      const bImpr = b.pages.reduce((s, p) => s + p.impressions, 0);
      return bImpr - aImpr;
    });

    return groups;
  }

  /**
   * For each matched page, finds competing pages and shared queries.
   * Returns a Map keyed by page URL.
   */
  async analyzeForPages(
    siteId: string,
    matches: { gscUrl: string; sanityId: string | undefined }[],
  ): Promise<Map<string, CannibalizationTarget[]>> {
    const groups = await this.analyzeSiteWide(siteId);
    const matchedUrls = new Set(matches.map((m) => m.gscUrl));
    const sanityIdByUrl = new Map<string, string>();
    for (const m of matches) {
      if (m.sanityId) sanityIdByUrl.set(m.gscUrl, m.sanityId);
    }

    const result = new Map<string, CannibalizationTarget[]>();

    for (const group of groups) {
      const pagesInGroup = group.pages.map((p) => p.page);
      const matchedPagesInGroup = pagesInGroup.filter((p) =>
        matchedUrls.has(p),
      );

      if (matchedPagesInGroup.length === 0) continue;

      for (const page of matchedPagesInGroup) {
        const competitors = pagesInGroup.filter((p) => p !== page);
        if (competitors.length === 0) continue;

        const existing = result.get(page) ?? [];

        for (const competitor of competitors) {
          // Check if we already have this competitor for this page
          const existingTarget = existing.find(
            (t) => t.competingPage === competitor,
          );
          if (existingTarget) {
            if (!existingTarget.sharedQueries.includes(group.query)) {
              existingTarget.sharedQueries.push(group.query);
            }
          } else {
            existing.push({
              competingPage: competitor,
              competingDocumentId: sanityIdByUrl.get(competitor) ?? "",
              sharedQueries: [group.query],
            });
          }
        }

        result.set(page, existing);
      }
    }

    return result;
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
