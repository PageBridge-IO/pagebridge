import { defineType, defineField } from "sanity";

export interface GscSnapshotOptions {
  contentTypes?: string[];
}

export const createGscSnapshot = (options: GscSnapshotOptions = {}) => {
  const contentTypes = options.contentTypes ?? [];

  return defineType({
    name: "gscSnapshot",
    title: "GSC Snapshot",
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
        name: "page",
        title: "Page URL",
        type: "string",
        validation: (Rule) => Rule.required(),
      }),
      ...(contentTypes.length > 0
        ? [
            defineField({
              name: "linkedDocument",
              title: "Linked Document",
              type: "reference",
              to: contentTypes.map((type) => ({ type })),
              description: "Auto-matched Sanity document",
            }),
          ]
        : []),
      defineField({
        name: "period",
        title: "Period",
        type: "string",
        options: {
          list: ["last7", "last28", "last90"],
        },
      }),
      defineField({
        name: "clicks",
        type: "number",
      }),
      defineField({
        name: "impressions",
        type: "number",
      }),
      defineField({
        name: "ctr",
        title: "CTR",
        type: "number",
        description: "Stored as decimal (0.05 = 5%)",
      }),
      defineField({
        name: "position",
        title: "Average Position",
        type: "number",
      }),
      defineField({
        name: "topQueries",
        title: "Top Queries",
        type: "array",
        of: [
          {
            type: "object",
            fields: [
              defineField({ name: "query", type: "string" }),
              defineField({ name: "clicks", type: "number" }),
              defineField({ name: "impressions", type: "number" }),
              defineField({ name: "position", type: "number" }),
            ],
          },
        ],
      }),
      defineField({
        name: "quickWinQueries",
        title: "Quick Win Queries",
        type: "array",
        description:
          "Queries at position 8-20 with high impressions — page 1 opportunities",
        of: [
          {
            type: "object",
            fields: [
              defineField({ name: "query", type: "string" }),
              defineField({ name: "clicks", type: "number" }),
              defineField({ name: "impressions", type: "number" }),
              defineField({ name: "ctr", type: "number" }),
              defineField({ name: "position", type: "number" }),
            ],
          },
        ],
      }),
      defineField({
        name: "ctrAnomaly",
        title: "CTR Anomaly",
        type: "object",
        description: "Detected when actual CTR is significantly below expected for position",
        fields: [
          defineField({ name: "detected", type: "boolean" }),
          defineField({ name: "actualCtr", type: "number", title: "Actual CTR" }),
          defineField({ name: "expectedCtr", type: "number", title: "Expected CTR" }),
          defineField({ name: "positionBucket", type: "number", title: "Position Bucket" }),
          defineField({
            name: "severity",
            type: "string",
            options: { list: ["low", "medium", "high"] },
          }),
          defineField({ name: "message", type: "string" }),
        ],
      }),
      defineField({
        name: "alerts",
        title: "Insight Alerts",
        type: "array",
        description: "Aggregated insight alerts for badge queries and notifications",
        of: [
          {
            type: "object",
            fields: [
              defineField({
                name: "type",
                type: "string",
                options: {
                  list: [
                    "ctr_anomaly",
                    "quick_win_available",
                    "position_decay",
                    "stale_content",
                    "cannibalization",
                  ],
                },
              }),
              defineField({
                name: "severity",
                type: "string",
                options: { list: ["low", "medium", "high"] },
              }),
              defineField({ name: "message", type: "string" }),
            ],
          },
        ],
      }),
      defineField({
        name: "dailyClicks",
        title: "Daily Metrics",
        type: "array",
        description: "28-day daily data points for sparkline charts",
        of: [
          {
            type: "object",
            fields: [
              defineField({ name: "date", type: "string" }),
              defineField({ name: "clicks", type: "number" }),
              defineField({ name: "impressions", type: "number" }),
              defineField({ name: "position", type: "number" }),
            ],
          },
        ],
      }),
      defineField({
        name: "publishingImpact",
        title: "Publishing Impact",
        type: "object",
        description: "Before/after metrics comparison around the last content edit",
        fields: [
          defineField({ name: "lastEditedAt", type: "datetime" }),
          defineField({ name: "daysSinceEdit", type: "number" }),
          defineField({ name: "positionBefore", type: "number" }),
          defineField({ name: "positionAfter", type: "number" }),
          defineField({ name: "positionDelta", type: "number" }),
          defineField({ name: "clicksBefore", type: "number" }),
          defineField({ name: "clicksAfter", type: "number" }),
          defineField({ name: "impressionsBefore", type: "number" }),
          defineField({ name: "impressionsAfter", type: "number" }),
          defineField({ name: "ctrBefore", type: "number" }),
          defineField({ name: "ctrAfter", type: "number" }),
        ],
      }),
      defineField({
        name: "cannibalizationTargets",
        title: "Cannibalization Targets",
        type: "array",
        description: "Other pages competing for the same queries",
        of: [
          {
            type: "object",
            fields: [
              defineField({ name: "competingPage", type: "string" }),
              defineField({ name: "competingDocumentId", type: "string" }),
              defineField({
                name: "sharedQueries",
                type: "array",
                of: [{ type: "string" }],
              }),
            ],
          },
        ],
      }),
      defineField({
        name: "fetchedAt",
        title: "Fetched At",
        type: "datetime",
      }),
      defineField({
        name: "indexStatus",
        title: "Index Status",
        type: "object",
        fields: [
          defineField({
            name: "verdict",
            title: "Verdict",
            type: "string",
            options: {
              list: ["indexed", "not_indexed", "excluded"],
            },
          }),
          defineField({
            name: "coverageState",
            title: "Coverage State",
            type: "string",
            description: "Human-readable index status from Google",
          }),
          defineField({
            name: "lastCrawlTime",
            title: "Last Crawl Time",
            type: "datetime",
          }),
          defineField({
            name: "robotsTxtState",
            title: "Robots.txt State",
            type: "string",
          }),
          defineField({
            name: "pageFetchState",
            title: "Page Fetch State",
            type: "string",
          }),
        ],
      }),
    ],
    preview: {
      select: { title: "page", subtitle: "period" },
    },
  });
};

// Default export for backward compatibility (without linkedDocument)
export const gscSnapshot = createGscSnapshot();
