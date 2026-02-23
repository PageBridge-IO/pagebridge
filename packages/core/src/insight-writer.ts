import type { SanityClient } from "@sanity/client";
import type { SiteInsightData } from "./site-insight-analyzer.js";
import type { CannibalizationGroup } from "./cannibalization-analyzer.js";
import type { QuickWinQuery } from "./quick-win-analyzer.js";
import { sanityKey } from "./utils/sanity-key.js";

export interface QuickWinPageSummary {
  page: string;
  documentId: string;
  documentTitle: string;
  queryCount: number;
  totalImpressions: number;
  avgPosition: number;
  queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
}

export class InsightWriter {
  constructor(private sanity: SanityClient) {}

  /**
   * Upserts a gscSiteInsight document for the given site.
   * Contains site-wide insights: top performers, zero-click pages,
   * orphan pages, new keywords, quick win pages, and cannibalization groups.
   */
  async write(
    siteId: string,
    data: SiteInsightData,
    cannibalizationGroups: CannibalizationGroup[],
    matchLookup: Map<string, { sanityId: string; title?: string }>,
    quickWins?: Map<string, QuickWinQuery[]>,
  ): Promise<void> {
    const insightId = `siteInsight-${siteId}`;

    // Aggregate quick wins per page for the dashboard
    const quickWinPages: (QuickWinPageSummary & { _key: string })[] = [];
    if (quickWins) {
      for (const [page, queries] of quickWins) {
        if (queries.length === 0) continue;
        const totalImpressions = queries.reduce((s, q) => s + q.impressions, 0);
        const avgPosition =
          queries.reduce((s, q) => s + q.position, 0) / queries.length;
        quickWinPages.push({
          _key: sanityKey(`qw:${page}`),
          page,
          documentId: matchLookup.get(page)?.sanityId ?? "",
          documentTitle: matchLookup.get(page)?.title ?? "",
          queryCount: queries.length,
          totalImpressions,
          avgPosition,
          queries: queries.map((q) => ({
            _key: sanityKey(`qwq:${page}:${q.query}`),
            query: q.query,
            clicks: q.clicks,
            impressions: q.impressions,
            ctr: q.ctr,
            position: q.position,
          })),
        });
      }
      quickWinPages.sort((a, b) => b.totalImpressions - a.totalImpressions);
    }

    const enriched = {
      _id: insightId,
      _type: "gscSiteInsight" as const,
      site: { _type: "reference" as const, _ref: siteId },
      topPerformers: data.topPerformers.map((p) => ({
        _key: sanityKey(`tp:${p.page}`),
        page: p.page,
        documentId: matchLookup.get(p.page)?.sanityId ?? "",
        documentTitle: matchLookup.get(p.page)?.title ?? "",
        clicks: p.clicks,
        impressions: p.impressions,
        position: p.position,
      })),
      zeroClickPages: data.zeroClickPages.map((p) => ({
        _key: sanityKey(`zc:${p.page}`),
        page: p.page,
        documentId: matchLookup.get(p.page)?.sanityId ?? "",
        documentTitle: matchLookup.get(p.page)?.title ?? "",
        impressions: p.impressions,
        clicks: p.clicks,
        position: p.position,
      })),
      orphanPages: data.orphanPages.map((p) => ({
        _key: sanityKey(`op:${p.page}`),
        page: p.page,
        documentId: matchLookup.get(p.page)?.sanityId ?? "",
        documentTitle: matchLookup.get(p.page)?.title ?? "",
      })),
      quickWinPages,
      newKeywordOpportunities: data.newKeywordOpportunities.map((k) => ({
        _key: sanityKey(`nk:${k.query}:${k.page}`),
        query: k.query,
        page: k.page,
        documentId: matchLookup.get(k.page)?.sanityId ?? "",
        impressions: k.impressions,
        position: k.position,
      })),
      cannibalizationGroups: cannibalizationGroups.slice(0, 50).map((g) => ({
        _key: sanityKey(`cg:${g.query}`),
        query: g.query,
        pages: g.pages.map((p) => ({
          _key: sanityKey(`cgp:${g.query}:${p.page}`),
          page: p.page,
          documentId: matchLookup.get(p.page)?.sanityId ?? "",
          clicks: p.clicks,
          impressions: p.impressions,
          position: p.position,
        })),
      })),
      lastComputedAt: new Date().toISOString(),
    };

    await this.sanity.createOrReplace(enriched);
  }
}
