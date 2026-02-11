import type { DrizzleClient } from "@pagebridge/db";
import { searchAnalytics, queryAnalytics } from "@pagebridge/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { daysAgo, formatDate } from "./utils/date-utils.js";

export interface TopPerformer {
  page: string;
  documentId?: string;
  documentTitle?: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface ZeroClickPage {
  page: string;
  documentId?: string;
  documentTitle?: string;
  impressions: number;
  clicks: number;
  position: number;
}

export interface OrphanPage {
  page: string;
  documentId?: string;
  documentTitle?: string;
  lastImpression?: string;
}

export interface NewKeywordOpportunity {
  query: string;
  page: string;
  impressions: number;
  position: number;
}

export interface SiteInsightData {
  topPerformers: TopPerformer[];
  zeroClickPages: ZeroClickPage[];
  orphanPages: OrphanPage[];
  newKeywordOpportunities: NewKeywordOpportunity[];
}

export class SiteInsightAnalyzer {
  constructor(private db: DrizzleClient) {}

  async analyze(
    siteId: string,
    allPages: string[],
  ): Promise<SiteInsightData> {
    const [topPerformers, zeroClickPages, orphanPages, newKeywords] =
      await Promise.all([
        this.getTopPerformers(siteId),
        this.getZeroClickPages(siteId),
        this.getOrphanPages(siteId, allPages),
        this.getNewKeywordOpportunities(siteId),
      ]);

    return {
      topPerformers,
      zeroClickPages,
      orphanPages,
      newKeywordOpportunities: newKeywords,
    };
  }

  private async getTopPerformers(siteId: string): Promise<TopPerformer[]> {
    const startDate = daysAgo(28);
    const endDate = daysAgo(3);

    const results = await this.db
      .select({
        page: searchAnalytics.page,
        totalClicks: sql<number>`sum(${searchAnalytics.clicks})`,
        totalImpressions: sql<number>`sum(${searchAnalytics.impressions})`,
        avgPosition: sql<number>`avg(${searchAnalytics.position})`,
      })
      .from(searchAnalytics)
      .where(
        and(
          eq(searchAnalytics.siteId, siteId),
          gte(searchAnalytics.date, formatDate(startDate)),
          lte(searchAnalytics.date, formatDate(endDate)),
        ),
      )
      .groupBy(searchAnalytics.page);

    return results
      .map((r) => ({
        page: r.page,
        clicks: Number(r.totalClicks) || 0,
        impressions: Number(r.totalImpressions) || 0,
        position: Number(r.avgPosition) || 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 20);
  }

  private async getZeroClickPages(siteId: string): Promise<ZeroClickPage[]> {
    const startDate = daysAgo(28);
    const endDate = daysAgo(3);

    const results = await this.db
      .select({
        page: searchAnalytics.page,
        totalClicks: sql<number>`sum(${searchAnalytics.clicks})`,
        totalImpressions: sql<number>`sum(${searchAnalytics.impressions})`,
        avgPosition: sql<number>`avg(${searchAnalytics.position})`,
      })
      .from(searchAnalytics)
      .where(
        and(
          eq(searchAnalytics.siteId, siteId),
          gte(searchAnalytics.date, formatDate(startDate)),
          lte(searchAnalytics.date, formatDate(endDate)),
        ),
      )
      .groupBy(searchAnalytics.page);

    return results
      .filter((r) => {
        const impressions = Number(r.totalImpressions) || 0;
        const clicks = Number(r.totalClicks) || 0;
        return impressions >= 100 && clicks <= 2;
      })
      .map((r) => ({
        page: r.page,
        impressions: Number(r.totalImpressions) || 0,
        clicks: Number(r.totalClicks) || 0,
        position: Number(r.avgPosition) || 0,
      }))
      .sort((a, b) => b.impressions - a.impressions);
  }

  private async getOrphanPages(
    siteId: string,
    allPages: string[],
  ): Promise<OrphanPage[]> {
    const startDate = daysAgo(28);
    const endDate = daysAgo(3);

    // Get pages that have had impressions in last 28 days
    const activeResults = await this.db
      .select({
        page: searchAnalytics.page,
      })
      .from(searchAnalytics)
      .where(
        and(
          eq(searchAnalytics.siteId, siteId),
          gte(searchAnalytics.date, formatDate(startDate)),
          lte(searchAnalytics.date, formatDate(endDate)),
        ),
      )
      .groupBy(searchAnalytics.page);

    const activePages = new Set(activeResults.map((r) => r.page));
    const orphanPageUrls = allPages.filter((page) => !activePages.has(page));

    if (orphanPageUrls.length === 0) return [];

    // Query the last impression date for each orphan page
    const lastImpressionResults = await this.db
      .select({
        page: searchAnalytics.page,
        lastDate: sql<string>`max(${searchAnalytics.date})`,
      })
      .from(searchAnalytics)
      .where(
        and(
          eq(searchAnalytics.siteId, siteId),
          sql`${searchAnalytics.page} IN (${sql.join(orphanPageUrls.map((u) => sql`${u}`), sql`, `)})`,
        ),
      )
      .groupBy(searchAnalytics.page);

    const lastImpressionMap = new Map<string, string>();
    for (const row of lastImpressionResults) {
      if (row.lastDate) lastImpressionMap.set(row.page, row.lastDate);
    }

    return orphanPageUrls.map((page) => ({
      page,
      lastImpression: lastImpressionMap.get(page),
    }));
  }

  private async getNewKeywordOpportunities(
    siteId: string,
  ): Promise<NewKeywordOpportunity[]> {
    const recentStart = daysAgo(7);
    const recentEnd = daysAgo(0);
    const historicStart = daysAgo(90);
    const historicEnd = daysAgo(14);

    // Get queries from last 7 days
    const recentQueries = await this.db
      .select({
        query: queryAnalytics.query,
        page: queryAnalytics.page,
        totalImpressions: sql<number>`sum(${queryAnalytics.impressions})`,
        avgPosition: sql<number>`avg(${queryAnalytics.position})`,
      })
      .from(queryAnalytics)
      .where(
        and(
          eq(queryAnalytics.siteId, siteId),
          gte(queryAnalytics.date, formatDate(recentStart)),
          lte(queryAnalytics.date, formatDate(recentEnd)),
        ),
      )
      .groupBy(queryAnalytics.query, queryAnalytics.page);

    // Get queries seen in days 14-90
    const historicQueryResults = await this.db
      .select({
        query: queryAnalytics.query,
      })
      .from(queryAnalytics)
      .where(
        and(
          eq(queryAnalytics.siteId, siteId),
          gte(queryAnalytics.date, formatDate(historicStart)),
          lte(queryAnalytics.date, formatDate(historicEnd)),
        ),
      )
      .groupBy(queryAnalytics.query);

    const historicQueries = new Set(historicQueryResults.map((r) => r.query));

    return recentQueries
      .filter(
        (r) =>
          !historicQueries.has(r.query) &&
          (Number(r.totalImpressions) || 0) >= 10,
      )
      .map((r) => ({
        query: r.query,
        page: r.page,
        impressions: Number(r.totalImpressions) || 0,
        position: Number(r.avgPosition) || 0,
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 50);
  }
}
