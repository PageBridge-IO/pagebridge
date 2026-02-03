import { defineType, defineField } from "sanity";

export interface GscRefreshTaskOptions {
  contentTypes?: string[];
}

export const createGscRefreshTask = (options: GscRefreshTaskOptions = {}) => {
  const contentTypes = options.contentTypes ?? [];

  return defineType({
    name: "gscRefreshTask",
    title: "Refresh Task",
    type: "document",
    fields: [
      defineField({
        name: "site",
        type: "reference",
        to: [{ type: "gscSite" }],
        validation: (Rule) => Rule.required(),
      }),
      ...(contentTypes.length > 0
        ? [
            defineField({
              name: "linkedDocument",
              title: "Content to Refresh",
              type: "reference",
              to: contentTypes.map((type) => ({ type })),
              validation: (Rule) => Rule.required(),
            }),
          ]
        : []),
      defineField({
        name: "reason",
        title: "Reason",
        type: "string",
        options: {
          list: [
            { title: "Position Decay", value: "position_decay" },
            { title: "Low CTR", value: "low_ctr" },
            { title: "Impressions Drop", value: "impressions_drop" },
            { title: "Manual", value: "manual" },
          ],
        },
      }),
      defineField({
        name: "severity",
        title: "Severity",
        type: "string",
        options: {
          list: [
            { title: "Low", value: "low" },
            { title: "Medium", value: "medium" },
            { title: "High", value: "high" },
          ],
        },
      }),
      defineField({
        name: "status",
        title: "Status",
        type: "string",
        options: {
          list: [
            { title: "Open", value: "open" },
            { title: "Snoozed", value: "snoozed" },
            { title: "In Progress", value: "in_progress" },
            { title: "Done", value: "done" },
            { title: "Dismissed", value: "dismissed" },
          ],
        },
        initialValue: "open",
      }),
      defineField({
        name: "snoozedUntil",
        title: "Snoozed Until",
        type: "datetime",
        hidden: ({ parent }) => parent?.status !== "snoozed",
      }),
      defineField({
        name: "metrics",
        title: "Metrics at Detection",
        type: "object",
        fields: [
          defineField({
            name: "positionBefore",
            type: "number",
            title: "Position (28 days ago)",
          }),
          defineField({
            name: "positionNow",
            type: "number",
            title: "Position (current)",
          }),
          defineField({
            name: "positionDelta",
            type: "number",
            title: "Position Change",
          }),
          defineField({
            name: "ctrBefore",
            type: "number",
            title: "CTR (28 days ago)",
          }),
          defineField({
            name: "ctrNow",
            type: "number",
            title: "CTR (current)",
          }),
          defineField({
            name: "impressions",
            type: "number",
            title: "Impressions (last 28d)",
          }),
        ],
      }),
      defineField({
        name: "queryContext",
        title: "Top Queries",
        type: "array",
        description: "What people searched to find this page",
        of: [
          {
            type: "object",
            fields: [
              defineField({
                name: "query",
                type: "string",
                title: "Query",
              }),
              defineField({
                name: "impressions",
                type: "number",
                title: "Impressions",
              }),
              defineField({
                name: "clicks",
                type: "number",
                title: "Clicks",
              }),
              defineField({
                name: "position",
                type: "number",
                title: "Avg Position",
              }),
            ],
            preview: {
              select: {
                query: "query",
                impressions: "impressions",
                position: "position",
              },
              prepare({ query, impressions, position }) {
                return {
                  title: query,
                  subtitle: `Pos ${position?.toFixed(1)} · ${impressions} impr`,
                };
              },
            },
          },
        ],
      }),
      defineField({
        name: "notes",
        title: "Notes",
        type: "text",
        description: "Why was this snoozed/dismissed?",
      }),
      defineField({
        name: "createdAt",
        type: "datetime",
      }),
      defineField({
        name: "resolvedAt",
        type: "datetime",
      }),
    ],
    orderings: [
      {
        title: "Severity",
        name: "severityDesc",
        by: [
          { field: "severity", direction: "desc" },
          { field: "createdAt", direction: "desc" },
        ],
      },
    ],
    preview: {
      select: {
        title: "linkedDocument.title",
        reason: "reason",
        severity: "severity",
      },
      prepare({ title, reason, severity }) {
        return {
          title: title || "Unknown document",
          subtitle: `${severity} · ${reason.replace(/_/g, " ")}`,
        };
      },
    },
  });
};

// Default export for backward compatibility (without linkedDocument)
export const gscRefreshTask = createGscRefreshTask();
