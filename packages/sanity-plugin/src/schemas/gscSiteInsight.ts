import { defineType, defineField } from "sanity";

export interface GscSiteInsightOptions {
  contentTypes?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const createGscSiteInsight = (options: GscSiteInsightOptions = {}) => {
  return defineType({
    name: "gscSiteInsight",
    title: "GSC Site Insight",
    type: "document",
    fields: [
      defineField({
        name: "site",
        title: "Site",
        type: "reference",
        to: [{ type: "gscSite" }],
        validation: (Rule) => Rule.required(),
      }),
      defineField({
        name: "topPerformers",
        title: "Top Performers",
        type: "array",
        description: "Top 20 pages by clicks (last 28 days)",
        of: [
          {
            type: "object",
            fields: [
              defineField({ name: "page", type: "string" }),
              defineField({ name: "documentId", type: "string" }),
              defineField({ name: "documentTitle", type: "string" }),
              defineField({ name: "clicks", type: "number" }),
              defineField({ name: "impressions", type: "number" }),
              defineField({ name: "position", type: "number" }),
            ],
          },
        ],
      }),
      defineField({
        name: "zeroClickPages",
        title: "Zero-Click Pages",
        type: "array",
        description:
          "Pages with 100+ impressions but 2 or fewer clicks (last 28 days)",
        of: [
          {
            type: "object",
            fields: [
              defineField({ name: "page", type: "string" }),
              defineField({ name: "documentId", type: "string" }),
              defineField({ name: "documentTitle", type: "string" }),
              defineField({ name: "impressions", type: "number" }),
              defineField({ name: "clicks", type: "number" }),
              defineField({ name: "position", type: "number" }),
            ],
          },
        ],
      }),
      defineField({
        name: "orphanPages",
        title: "Orphan Pages",
        type: "array",
        description: "Pages with no impressions in last 28 days",
        of: [
          {
            type: "object",
            fields: [
              defineField({ name: "page", type: "string" }),
              defineField({ name: "documentId", type: "string" }),
              defineField({ name: "documentTitle", type: "string" }),
            ],
          },
        ],
      }),
      defineField({
        name: "newKeywordOpportunities",
        title: "New Keyword Opportunities",
        type: "array",
        description:
          "Queries appearing in last 7 days not seen in previous 14-90 day window",
        of: [
          {
            type: "object",
            fields: [
              defineField({ name: "query", type: "string" }),
              defineField({ name: "page", type: "string" }),
              defineField({ name: "documentId", type: "string" }),
              defineField({ name: "impressions", type: "number" }),
              defineField({ name: "position", type: "number" }),
            ],
          },
        ],
      }),
      defineField({
        name: "quickWinPages",
        title: "Quick Win Pages",
        type: "array",
        description:
          "Pages with queries at positions 8-20 that have high impressions (page 1 opportunities)",
        of: [
          {
            type: "object",
            fields: [
              defineField({ name: "page", type: "string" }),
              defineField({ name: "documentId", type: "string" }),
              defineField({ name: "documentTitle", type: "string" }),
              defineField({ name: "queryCount", type: "number" }),
              defineField({ name: "totalImpressions", type: "number" }),
              defineField({ name: "avgPosition", type: "number" }),
            ],
          },
        ],
      }),
      defineField({
        name: "cannibalizationGroups",
        title: "Cannibalization Groups",
        type: "array",
        description: "Queries where 2+ pages compete",
        of: [
          {
            type: "object",
            fields: [
              defineField({ name: "query", type: "string" }),
              defineField({
                name: "pages",
                type: "array",
                of: [
                  {
                    type: "object",
                    fields: [
                      defineField({ name: "page", type: "string" }),
                      defineField({ name: "documentId", type: "string" }),
                      defineField({ name: "clicks", type: "number" }),
                      defineField({ name: "impressions", type: "number" }),
                      defineField({ name: "position", type: "number" }),
                    ],
                  },
                ],
              }),
            ],
          },
        ],
      }),
      defineField({
        name: "lastComputedAt",
        title: "Last Computed",
        type: "datetime",
      }),
    ],
    preview: {
      select: { title: "site.siteUrl", subtitle: "lastComputedAt" },
      prepare({ title, subtitle }) {
        return {
          title: title || "Site Insights",
          subtitle: subtitle
            ? `Updated ${new Date(subtitle).toLocaleDateString()}`
            : "Not computed yet",
        };
      },
    },
  });
};

export const gscSiteInsight = createGscSiteInsight();
