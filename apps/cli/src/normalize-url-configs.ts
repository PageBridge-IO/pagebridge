import { log } from "./logger.js";

interface SiteDocConfig {
  urlConfigs?: Array<{
    contentType: string;
    pathPrefix?: string;
    slugField?: string;
  }>;
  pathPrefix?: string;
  contentTypes?: string[];
  slugField?: string;
}

export interface NormalizedUrlConfig {
  contentType: string;
  pathPrefix?: string;
  slugField: string;
}

/**
 * Normalizes a gscSite document's URL configuration into a consistent format.
 * Supports the new `urlConfigs` format, the deprecated `contentTypes` format,
 * and falls back to sensible defaults.
 */
export function normalizeUrlConfigs(
  siteDoc: SiteDocConfig,
): NormalizedUrlConfig[] {
  if (siteDoc.urlConfigs) {
    return siteDoc.urlConfigs.map((config) => ({
      contentType: config.contentType,
      pathPrefix: config.pathPrefix,
      slugField: config.slugField ?? "slug",
    }));
  }

  if (siteDoc.contentTypes) {
    log.warn(
      `[DEPRECATED] Using old configuration format (contentTypes, slugField, pathPrefix). ` +
        `Please update your gscSite document to use 'urlConfigs' for more flexible URL path handling. ` +
        `See https://pagebridge.io/docs/migration for details.`,
    );
    return siteDoc.contentTypes.map((contentType: string) => ({
      contentType,
      slugField: siteDoc.slugField ?? "slug",
      pathPrefix: siteDoc.pathPrefix,
    }));
  }

  return [
    { contentType: "post", slugField: "slug" },
    { contentType: "page", slugField: "slug" },
  ];
}
