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
      name: "urlConfigs",
      title: "URL Configurations",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({
              name: "contentType",
              title: "Content Type",
              type: "string",
              description: "The Sanity document type (e.g., post, page, article)",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "pathPrefix",
              title: "URL Path Prefix",
              type: "string",
              description:
                'The URL path for this content type. E.g., "/blog" for /blog/article-slug, or leave empty for root-level URLs like /about-us',
            }),
            defineField({
              name: "slugField",
              title: "Slug Field Name",
              type: "string",
              initialValue: "slug",
              description: "The field in your document containing the URL slug",
            }),
          ],
        },
      ],
      description:
        "Configure how each content type maps to URLs on your site. Each content type can have its own path prefix and slug field.",
    }),
    defineField({
      name: "pathPrefix",
      title: "Path Prefix (Deprecated)",
      type: "string",
      description:
        "⚠️ DEPRECATED: Use 'URL Configurations' above instead. This field is kept for backward compatibility only. If both are present, URL Configurations takes precedence.",
      hidden: false, // Show but with deprecation notice
    }),
    defineField({
      name: "contentTypes",
      title: "Content Types (Deprecated)",
      type: "array",
      of: [{ type: "string" }],
      description:
        "⚠️ DEPRECATED: Use 'URL Configurations' above instead. This field is kept for backward compatibility only. If both are present, URL Configurations takes precedence.",
      hidden: false,
    }),
    defineField({
      name: "slugField",
      title: "Slug Field (Deprecated)",
      type: "string",
      description:
        "⚠️ DEPRECATED: Use 'URL Configurations' above instead. This field is kept for backward compatibility only. If both are present, URL Configurations takes precedence.",
      hidden: false,
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
