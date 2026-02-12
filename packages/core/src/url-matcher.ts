import type { SanityClient } from "@sanity/client";

export type UnmatchReason =
  | "matched" // Successfully matched
  | "no_slug_extracted" // URL parsing failed or empty path after prefix
  | "no_matching_document" // Slug extracted but no Sanity doc found
  | "outside_path_prefix"; // URL doesn't contain the configured prefix

export interface MatchDiagnostics {
  normalizedUrl: string;
  pathAfterPrefix: string | null;
  configuredPrefix: string | null;
  availableSlugsCount: number;
  similarSlugs: string[]; // Top 3 similar slugs for suggestions
}

export interface MatchResult {
  gscUrl: string;
  sanityId: string | undefined;
  confidence: "exact" | "normalized" | "fuzzy" | "none";
  matchedSlug?: string;
  unmatchReason: UnmatchReason;
  extractedSlug?: string;
  matchedContentType?: string;
  diagnostics?: MatchDiagnostics;
}

/**
 * Configuration for a single content type's URL structure
 */
export interface ContentTypeUrlConfig {
  contentType: string;
  pathPrefix?: string;
  slugField: string;
}

/**
 * URLMatcher configuration with support for multiple content types and path structures
 * @deprecated If using the old flat structure (contentTypes, slugField, pathPrefix),
 * migrate to urlConfigs for more flexible URL path handling.
 */
export interface URLMatcherConfig {
  /** New format: array of per-content-type URL configs (recommended) */
  urlConfigs?: ContentTypeUrlConfig[];
  /** @deprecated Use urlConfigs instead. Kept for backward compatibility. */
  contentTypes?: string[];
  /** @deprecated Use urlConfigs instead. Kept for backward compatibility. */
  slugField?: string;
  /** @deprecated Use urlConfigs instead. Kept for backward compatibility. */
  pathPrefix?: string;
  baseUrl: string;
}

interface SanityDocument {
  _id: string;
  _type: string;
  _createdAt: string;
  [key: string]: unknown;
}

export class URLMatcher {
  private normalizedConfigs: ContentTypeUrlConfig[];

  constructor(
    private sanityClient: SanityClient,
    private config: URLMatcherConfig,
  ) {
    // Normalize config: convert old format to new format if needed
    if (config.urlConfigs) {
      this.normalizedConfigs = config.urlConfigs;
    } else if (config.contentTypes) {
      // Backward compatibility: convert old flat format to new format
      console.warn(
        "[URLMatcher] Deprecated: contentTypes, slugField, and pathPrefix are deprecated. " +
          "Please use urlConfigs instead for more flexible URL path handling per content type.",
      );
      this.normalizedConfigs = config.contentTypes.map((contentType) => ({
        contentType,
        slugField: config.slugField || "slug",
        pathPrefix: config.pathPrefix,
      }));
    } else {
      throw new Error(
        "URLMatcher requires either 'urlConfigs' (new format) or 'contentTypes' (deprecated format)",
      );
    }
  }

  async matchUrls(gscUrls: string[]): Promise<MatchResult[]> {
    // Query documents for each content type with its configured slug field
    const slugToDocMap = new Map<
      string,
      { _id: string; _createdAt: string; contentType: string }
    >();
    const allSlugs: string[] = [];

    for (const urlConfig of this.normalizedConfigs) {
      const query = `*[_type == $type]{
        _id,
        _type,
        "${urlConfig.slugField}": ${urlConfig.slugField}.current,
        _createdAt
      }`;
      const documents: SanityDocument[] = await this.sanityClient.fetch(query, {
        type: urlConfig.contentType,
      });

      for (const doc of documents) {
        const slug = doc[urlConfig.slugField] as string | undefined;
        if (slug) {
          const normalized = this.normalizeSlug(slug);
          const key = `${urlConfig.contentType}:${normalized}`;
          slugToDocMap.set(key, {
            _id: doc._id,
            _createdAt: doc._createdAt,
            contentType: urlConfig.contentType,
          });
          allSlugs.push(normalized);
        }
      }
    }

    return gscUrls.map((url) =>
      this.matchSingleUrl(url, slugToDocMap, allSlugs),
    );
  }

  /**
   * Get all available slugs from Sanity for diagnostic purposes
   */
  async getAvailableSlugs(): Promise<string[]> {
    const allSlugs: string[] = [];

    for (const urlConfig of this.normalizedConfigs) {
      const query = `*[_type == $type]{
        "${urlConfig.slugField}": ${urlConfig.slugField}.current
      }`;
      const documents: SanityDocument[] = await this.sanityClient.fetch(query, {
        type: urlConfig.contentType,
      });

      const slugs = documents
        .map((doc) => doc[urlConfig.slugField] as string | undefined)
        .filter((slug): slug is string => !!slug)
        .map((slug) => this.normalizeSlug(slug));

      allSlugs.push(...slugs);
    }

    return allSlugs;
  }

  private matchSingleUrl(
    gscUrl: string,
    slugToDocMap: Map<
      string,
      { _id: string; _createdAt: string; contentType: string }
    >,
    allSlugs: string[],
  ): MatchResult {
    const normalized = this.normalizeUrl(gscUrl);

    // Try to match against each content type's path prefix
    for (const urlConfig of this.normalizedConfigs) {
      const extractionResult = this.extractSlugWithDiagnostics(
        normalized,
        urlConfig.pathPrefix,
      );

      if (extractionResult.outsidePrefix) {
        continue; // Try next content type
      }

      const slug = extractionResult.slug;

      if (!slug) {
        continue; // Try next content type
      }

      // Try exact match
      const key = `${urlConfig.contentType}:${slug}`;
      const exactMatch = slugToDocMap.get(key);
      if (exactMatch) {
        return {
          gscUrl,
          sanityId: exactMatch._id,
          confidence: "exact",
          matchedSlug: slug,
          matchedContentType: urlConfig.contentType,
          unmatchReason: "matched",
          extractedSlug: slug,
        };
      }

      // Try without trailing slash
      const withoutTrailing = slug.replace(/\/$/, "");
      const keyWithoutTrailing = `${urlConfig.contentType}:${withoutTrailing}`;
      const trailingMatch = slugToDocMap.get(keyWithoutTrailing);
      if (trailingMatch) {
        return {
          gscUrl,
          sanityId: trailingMatch._id,
          confidence: "normalized",
          matchedSlug: withoutTrailing,
          matchedContentType: urlConfig.contentType,
          unmatchReason: "matched",
          extractedSlug: slug,
        };
      }

      // Try with trailing slash
      const withTrailing = slug + "/";
      const keyWithTrailing = `${urlConfig.contentType}:${withTrailing}`;
      const addedTrailingMatch = slugToDocMap.get(keyWithTrailing);
      if (addedTrailingMatch) {
        return {
          gscUrl,
          sanityId: addedTrailingMatch._id,
          confidence: "normalized",
          matchedSlug: withTrailing,
          matchedContentType: urlConfig.contentType,
          unmatchReason: "matched",
          extractedSlug: slug,
        };
      }
    }

    // No match found across any content type - return diagnostic info
    const firstConfig = this.normalizedConfigs[0];
    const firstExtractionResult = this.extractSlugWithDiagnostics(
      normalized,
      firstConfig?.pathPrefix,
    );

    const similarSlugs = this.findSimilarSlugs(
      firstExtractionResult.slug || "",
      allSlugs,
      3,
    );

    return {
      gscUrl,
      sanityId: undefined,
      confidence: "none",
      unmatchReason: firstExtractionResult.outsidePrefix
        ? "outside_path_prefix"
        : "no_matching_document",
      extractedSlug: firstExtractionResult.slug,
      diagnostics: {
        normalizedUrl: normalized,
        pathAfterPrefix: firstExtractionResult.pathAfterPrefix,
        configuredPrefix: firstConfig?.pathPrefix ?? null,
        availableSlugsCount: slugToDocMap.size,
        similarSlugs,
      },
    };
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hostname = parsed.hostname.replace(/^www\./, "");
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString().toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  private extractSlugWithDiagnostics(
    normalizedUrl: string,
    pathPrefix?: string,
  ): {
    slug: string | undefined;
    pathAfterPrefix: string | null;
    outsidePrefix: boolean;
  } {
    try {
      const parsed = new URL(normalizedUrl);
      let path = parsed.pathname;

      // Check if the URL is outside the configured path prefix
      if (pathPrefix) {
        const prefixRegex = new RegExp(`^${this.escapeRegex(pathPrefix)}(/|$)`);
        if (!prefixRegex.test(path)) {
          return {
            slug: undefined,
            pathAfterPrefix: null,
            outsidePrefix: true,
          };
        }
        path = path.replace(
          new RegExp(`^${this.escapeRegex(pathPrefix)}`),
          "",
        );
      }

      const slug = path.replace(/^\/+|\/+$/g, "");
      return {
        slug: slug || undefined,
        pathAfterPrefix: path,
        outsidePrefix: false,
      };
    } catch {
      return {
        slug: undefined,
        pathAfterPrefix: null,
        outsidePrefix: false,
      };
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private normalizeSlug(slug: string): string {
    return slug.replace(/^\/+|\/+$/g, "").toLowerCase();
  }

  /**
   * Find similar slugs using Levenshtein distance
   */
  private findSimilarSlugs(
    target: string,
    candidates: string[],
    limit: number,
  ): string[] {
    const scored = candidates
      .map((candidate) => ({
        slug: candidate,
        distance: this.levenshteinDistance(target, candidate),
      }))
      .filter((item) => item.distance <= Math.max(target.length * 0.5, 10)) // Only include reasonably similar
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    return scored.map((item) => item.slug);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1, // substitution
            matrix[i]![j - 1]! + 1, // insertion
            matrix[i - 1]![j]! + 1, // deletion
          );
        }
      }
    }

    return matrix[b.length]![a.length]!;
  }
}
