import type { DrizzleClient } from "@pagebridge/db";
import { searchAnalytics } from "@pagebridge/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { daysAgo, formatDate } from "./utils/date-utils.js";

/** Industry-average CTR by position (positions 1-10) */
export const EXPECTED_CTR_BY_POSITION: Record<number, number> = {
  1: 0.319,
  2: 0.246,
  3: 0.185,
  4: 0.133,
  5: 0.095,
  6: 0.069,
  7: 0.052,
  8: 0.041,
  9: 0.033,
  10: 0.028,
};

export type CtrAnomalySeverity = "low" | "medium" | "high";

export interface CtrAnomaly {
  page: string;
  detected: boolean;
  actualCtr: number;
  expectedCtr: number;
  positionBucket: number;
  severity: CtrAnomalySeverity;
  message: string;
}

export interface InsightAlert {
  type:
    | "ctr_anomaly"
    | "quick_win_available"
    | "position_decay"
    | "stale_content"
    | "cannibalization";
  severity: "low" | "medium" | "high";
  message: string;
}

export interface CtrAnomalyConfig {
  /** Minimum impressions over the period (default: 100) */
  minImpressions: number;
  /** Maximum average position to analyze (default: 10) */
  maxPosition: number;
  /** Ratio thresholds: actual/expected below this = high severity (default: 0.25) */
  highThreshold: number;
  /** Ratio thresholds: actual/expected below this = medium severity (default: 0.5) */
  mediumThreshold: number;
  /** Ratio thresholds: actual/expected below this = low severity (default: 0.75) */
  lowThreshold: number;
}

const defaultConfig: CtrAnomalyConfig = {
  minImpressions: 100,
  maxPosition: 10,
  highThreshold: 0.25,
  mediumThreshold: 0.5,
  lowThreshold: 0.75,
};

export class CtrAnomalyAnalyzer {
  private config: CtrAnomalyConfig;

  constructor(
    private db: DrizzleClient,
    config?: Partial<CtrAnomalyConfig>,
  ) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Analyzes pages for CTR anomalies — pages ranking in top 10 positions
   * with CTR significantly below industry averages.
   */
  async analyze(siteId: string): Promise<Map<string, CtrAnomaly>> {
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

    const anomalies = new Map<string, CtrAnomaly>();

    for (const row of results) {
      const position = Number(row.avgPosition) || 0;
      const impressions = Number(row.totalImpressions) || 0;
      const clicks = Number(row.totalClicks) || 0;

      if (position > this.config.maxPosition || position < 1) continue;
      if (impressions < this.config.minImpressions) continue;

      const positionBucket = Math.round(position);
      const expectedCtr =
        EXPECTED_CTR_BY_POSITION[
          Math.min(positionBucket, 10) as keyof typeof EXPECTED_CTR_BY_POSITION
        ] ?? 0.028;
      const actualCtr = impressions > 0 ? clicks / impressions : 0;

      const ratio = expectedCtr > 0 ? actualCtr / expectedCtr : 1;

      if (ratio >= this.config.lowThreshold) continue;

      const severity: CtrAnomalySeverity =
        ratio < this.config.highThreshold
          ? "high"
          : ratio < this.config.mediumThreshold
            ? "medium"
            : "low";

      const expectedPct = (expectedCtr * 100).toFixed(1);
      const actualPct = (actualCtr * 100).toFixed(1);

      anomalies.set(row.page, {
        page: row.page,
        detected: true,
        actualCtr,
        expectedCtr,
        positionBucket,
        severity,
        message: `CTR is ${actualPct}% vs ${expectedPct}% expected for position ${positionBucket}`,
      });
    }

    return anomalies;
  }

  /**
   * Builds alert objects from anomaly results + other insight data
   * for writing to snapshot documents.
   */
  static buildAlerts(
    ctrAnomaly?: CtrAnomaly,
    hasQuickWins?: boolean,
    hasDecay?: boolean,
    hasCannibalization?: boolean,
  ): InsightAlert[] {
    const alerts: InsightAlert[] = [];

    if (ctrAnomaly?.detected) {
      alerts.push({
        type: "ctr_anomaly",
        severity: ctrAnomaly.severity,
        message: ctrAnomaly.message,
      });
    }

    if (hasQuickWins) {
      alerts.push({
        type: "quick_win_available",
        severity: "low",
        message: "Page 1 opportunities found — queries at positions 8-20",
      });
    }

    if (hasDecay) {
      alerts.push({
        type: "position_decay",
        severity: "medium",
        message: "Content decay detected — performance declining",
      });
    }

    if (hasCannibalization) {
      alerts.push({
        type: "cannibalization",
        severity: "medium",
        message: "Query cannibalization detected — multiple pages competing",
      });
    }

    return alerts;
  }
}
