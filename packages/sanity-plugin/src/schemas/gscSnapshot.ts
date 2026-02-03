import { defineType, defineField } from "sanity";

export const gscSnapshot = defineType({
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
    defineField({
      name: "linkedDocument",
      title: "Linked Document",
      type: "reference",
      to: [{ type: "post" }, { type: "page" }],
      description: "Auto-matched Sanity document",
    }),
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
  ],
  preview: {
    select: { title: "page", subtitle: "period" },
  },
});
