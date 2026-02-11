import type { SanityClient } from "@sanity/client";
import type { SiteInsightData } from "./site-insight-analyzer.js";
import type { CannibalizationGroup } from "./cannibalization-analyzer.js";

export class InsightWriter {
  constructor(private sanity: SanityClient) {}

  /**
   * Upserts a gscSiteInsight document for the given site.
   * Contains site-wide insights: top performers, zero-click pages,
   * orphan pages, new keywords, and cannibalization groups.
   */
  async write(
    siteId: string,
    data: SiteInsightData,
    cannibalizationGroups: CannibalizationGroup[],
    matchLookup: Map<string, { sanityId: string; title?: string }>,
  ): Promise<void> {
    const insightId = `siteInsight-${siteId}`;

    const enriched = {
      _id: insightId,
      _type: "gscSiteInsight" as const,
      site: { _type: "reference" as const, _ref: siteId },
      topPerformers: data.topPerformers.map((p) => ({
        page: p.page,
        documentId: matchLookup.get(p.page)?.sanityId ?? "",
        documentTitle: matchLookup.get(p.page)?.title ?? "",
        clicks: p.clicks,
        impressions: p.impressions,
        position: p.position,
      })),
      zeroClickPages: data.zeroClickPages.map((p) => ({
        page: p.page,
        documentId: matchLookup.get(p.page)?.sanityId ?? "",
        documentTitle: matchLookup.get(p.page)?.title ?? "",
        impressions: p.impressions,
        clicks: p.clicks,
        position: p.position,
      })),
      orphanPages: data.orphanPages.map((p) => ({
        page: p.page,
        documentId: matchLookup.get(p.page)?.sanityId ?? "",
        documentTitle: matchLookup.get(p.page)?.title ?? "",
      })),
      newKeywordOpportunities: data.newKeywordOpportunities.map((k) => ({
        query: k.query,
        page: k.page,
        documentId: matchLookup.get(k.page)?.sanityId ?? "",
        impressions: k.impressions,
        position: k.position,
      })),
      cannibalizationGroups: cannibalizationGroups.slice(0, 50).map((g) => ({
        query: g.query,
        pages: g.pages.map((p) => ({
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
