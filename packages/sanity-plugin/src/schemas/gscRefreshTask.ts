import { defineType, defineField } from "sanity";

export const gscRefreshTask = defineType({
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
    defineField({
      name: "linkedDocument",
      title: "Content to Refresh",
      type: "reference",
      to: [{ type: "post" }, { type: "page" }],
      validation: (Rule) => Rule.required(),
    }),
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
        defineField({ name: "positionBefore", type: "number", title: "Position (28 days ago)" }),
        defineField({ name: "positionNow", type: "number", title: "Position (current)" }),
        defineField({ name: "positionDelta", type: "number", title: "Position Change" }),
        defineField({ name: "ctrBefore", type: "number", title: "CTR (28 days ago)" }),
        defineField({ name: "ctrNow", type: "number", title: "CTR (current)" }),
        defineField({ name: "impressions", type: "number", title: "Impressions (last 28d)" }),
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
});
