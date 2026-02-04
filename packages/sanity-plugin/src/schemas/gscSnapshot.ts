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
