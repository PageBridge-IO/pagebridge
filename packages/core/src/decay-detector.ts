import type { DrizzleClient } from "@pagebridge/db";
import { searchAnalytics } from "@pagebridge/db";
import { and, avg, gte, lte, sql, eq } from "drizzle-orm";

export interface DecayRule {
  type: "position_decay" | "low_ctr" | "impressions_drop";
  threshold: number;
  minImpressions: number;
  comparisonWindowDays: number;
  sustainedDays: number;
}

export interface QuietPeriodConfig {
  enabled: boolean;
  days: number;
}

export interface DecaySignal {
  page: string;
  reason: "position_decay" | "low_ctr" | "impressions_drop";
  severity: "low" | "medium" | "high";
  metrics: {
    positionBefore: number;
    positionNow: number;
    positionDelta: number;
    ctrBefore: number;
    ctrNow: number;
    impressions: number;
  };
}

interface PageMetrics {
  page: string;
  position: number;
  ctr: number;
  impressions: number;
}

export const defaultRules: DecayRule[] = [
  {
    type: "position_decay",
    threshold: 3,
    minImpressions: 100,
    comparisonWindowDays: 28,
    sustainedDays: 14,
  },
  {
    type: "low_ctr",
    threshold: 0.01,
    minImpressions: 1000,
    comparisonWindowDays: 28,
    sustainedDays: 7,
  },
  {
    type: "impressions_drop",
    threshold: 0.5,
    minImpressions: 500,
    comparisonWindowDays: 28,
    sustainedDays: 14,
  },
];

export class DecayDetector {
  constructor(
    private db: DrizzleClient,
    private rules: DecayRule[] = defaultRules,
  ) {}

  async detectDecay(
    siteId: string,
    publishedDates: Map<string, Date>,
    quietPeriod: QuietPeriodConfig = { enabled: true, days: 45 },
  ): Promise<DecaySignal[]> {
    const signals: DecaySignal[] = [];
    const now = new Date();

    for (const rule of this.rules) {
      const currentPeriodEnd = now;
      const currentPeriodStart = daysAgo(rule.sustainedDays);
      const previousPeriodEnd = daysAgo(rule.comparisonWindowDays);
      const previousPeriodStart = daysAgo(
        rule.comparisonWindowDays + rule.sustainedDays,
      );

      const [currentMetrics, previousMetrics] = await Promise.all([
        this.getAverageMetrics(siteId, currentPeriodStart, currentPeriodEnd),
        this.getAverageMetrics(siteId, previousPeriodStart, previousPeriodEnd),
      ]);

      for (const current of currentMetrics) {
        if (quietPeriod.enabled) {
          const publishDate = publishedDates.get(current.page);
          if (publishDate && daysSince(publishDate) < quietPeriod.days) {
            continue;
          }
        }

        if (current.impressions < rule.minImpressions) continue;

        const previous = previousMetrics.find((p) => p.page === current.page);
        if (!previous) continue;

        const signal = this.evaluateRule(rule, current, previous);
        if (signal) signals.push(signal);
      }
    }

    return this.deduplicateSignals(signals);
  }

  private async getAverageMetrics(
    siteId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PageMetrics[]> {
    const results = await this.db
      .select({
        page: searchAnalytics.page,
        avgPosition: avg(searchAnalytics.position),
        avgCtr: avg(searchAnalytics.ctr),
        totalImpressions: sql<number>`sum(${searchAnalytics.impressions})`,
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

    return results.map((r) => ({
      page: r.page,
      position: Number(r.avgPosition) || 0,
      ctr: Number(r.avgCtr) || 0,
      impressions: Number(r.totalImpressions) || 0,
    }));
  }

  private evaluateRule(
    rule: DecayRule,
    current: PageMetrics,
    previous: PageMetrics,
  ): DecaySignal | undefined {
    switch (rule.type) {
      case "position_decay": {
        const delta = current.position - previous.position;
        if (delta >= rule.threshold) {
          return {
            page: current.page,
            reason: "position_decay",
            severity: this.calculateSeverity(delta, [3, 5, 8]),
            metrics: {
              positionBefore: previous.position,
              positionNow: current.position,
              positionDelta: delta,
              ctrBefore: previous.ctr,
              ctrNow: current.ctr,
              impressions: current.impressions,
            },
          };
        }
        break;
      }

      case "low_ctr": {
        if (current.ctr < rule.threshold && current.position <= 10) {
          return {
            page: current.page,
            reason: "low_ctr",
            severity: this.calculateSeverity(
              rule.threshold - current.ctr,
              [0.005, 0.01, 0.02],
            ),
            metrics: {
              positionBefore: previous.position,
              positionNow: current.position,
              positionDelta: current.position - previous.position,
              ctrBefore: previous.ctr,
              ctrNow: current.ctr,
              impressions: current.impressions,
            },
          };
        }
        break;
      }

      case "impressions_drop": {
        const dropRatio = 1 - current.impressions / previous.impressions;
        if (dropRatio >= rule.threshold) {
          return {
            page: current.page,
            reason: "impressions_drop",
            severity: this.calculateSeverity(dropRatio, [0.3, 0.5, 0.7]),
            metrics: {
              positionBefore: previous.position,
              positionNow: current.position,
              positionDelta: current.position - previous.position,
              ctrBefore: previous.ctr,
              ctrNow: current.ctr,
              impressions: current.impressions,
            },
          };
        }
        break;
      }
    }

    return undefined;
  }

  private calculateSeverity(
    value: number,
    thresholds: [number, number, number],
  ): "low" | "medium" | "high" {
    if (value >= thresholds[2]) return "high";
    if (value >= thresholds[1]) return "medium";
    return "low";
  }

  private deduplicateSignals(signals: DecaySignal[]): DecaySignal[] {
    const byPage = new Map<string, DecaySignal>();
    const severityOrder = { high: 3, medium: 2, low: 1 };

    for (const signal of signals) {
      const existing = byPage.get(signal.page);
      if (
        !existing ||
        severityOrder[signal.severity] > severityOrder[existing.severity]
      ) {
        byPage.set(signal.page, signal);
      }
    }

    return Array.from(byPage.values());
  }
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function daysSince(date: Date): number {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}
