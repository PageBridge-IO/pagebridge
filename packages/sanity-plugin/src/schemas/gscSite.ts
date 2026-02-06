import { defineType, defineField } from "sanity";

export const gscSite = defineType({
  name: "gscSite",
  title: "GSC Site",
  type: "document",
  fields: [
    defineField({
      name: "siteUrl",
      title: "Site URL",
      type: "string",
      description: "Exactly as it appears in GSC (e.g., sc-domain:example.com)",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "siteUrl" },
      description: "Used for filtering in multi-site setups",
    }),
    defineField({
      name: "defaultLocale",
      title: "Default Locale",
      type: "string",
      initialValue: "en",
    }),
    defineField({
      name: "pathPrefix",
      title: "Path Prefix",
      type: "string",
      description: 'If your blog lives at /blog, enter "/blog"',
    }),
    defineField({
      name: "contentTypes",
      title: "Content Types",
      type: "array",
      of: [{ type: "string" }],
      initialValue: ["post", "page"],
      description:
        "Sanity document types to match URLs against (e.g., post, page, article)",
    }),
    defineField({
      name: "slugField",
      title: "Slug Field",
      type: "string",
      initialValue: "slug",
      description: "The field name containing the URL slug (default: slug)",
    }),
    defineField({
      name: "lastSyncedAt",
      title: "Last Synced",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "lastDiagnosticsAt",
      title: "Last Diagnostics Run",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "unmatchedCount",
      title: "Unmatched URLs",
      type: "number",
      readOnly: true,
      description:
        "Number of GSC URLs that could not be matched to Sanity documents",
    }),
  ],
});
