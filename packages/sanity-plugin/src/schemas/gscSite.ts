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
      name: "lastSyncedAt",
      title: "Last Synced",
      type: "datetime",
      readOnly: true,
    }),
  ],
});
