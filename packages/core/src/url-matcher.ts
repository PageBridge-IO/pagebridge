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
  diagnostics?: MatchDiagnostics;
}

export interface URLMatcherConfig {
  contentTypes: string[];
  slugField: string;
  pathPrefix?: string;
  baseUrl: string;
}

interface SanityDocument {
  _id: string;
  _createdAt: string;
  [key: string]: unknown;
}

export class URLMatcher {
  constructor(
    private sanityClient: SanityClient,
    private config: URLMatcherConfig,
  ) {}

  async matchUrls(gscUrls: string[]): Promise<MatchResult[]> {
    const query = `*[_type in $types]{
      _id,
      _type,
      "${this.config.slugField}": ${this.config.slugField}.current,
      _createdAt
    }`;
    const documents: SanityDocument[] = await this.sanityClient.fetch(query, {
      types: this.config.contentTypes,
    });

    const slugToDoc = new Map<string, { _id: string; _createdAt: string }>();
    const allSlugs: string[] = [];
    for (const doc of documents) {
      const slug = doc[this.config.slugField] as string | undefined;
      if (slug) {
        const normalized = this.normalizeSlug(slug);
        slugToDoc.set(normalized, doc);
        allSlugs.push(normalized);
      }
    }

    return gscUrls.map((url) => this.matchSingleUrl(url, slugToDoc, allSlugs));
  }

  /**
   * Get all available slugs from Sanity for diagnostic purposes
   */
  async getAvailableSlugs(): Promise<string[]> {
    const query = `*[_type in $types]{
      "${this.config.slugField}": ${this.config.slugField}.current
    }`;
    const documents: SanityDocument[] = await this.sanityClient.fetch(query, {
      types: this.config.contentTypes,
    });

    return documents
      .map((doc) => doc[this.config.slugField] as string | undefined)
      .filter((slug): slug is string => !!slug)
      .map((slug) => this.normalizeSlug(slug));
  }

  private matchSingleUrl(
    gscUrl: string,
    slugToDoc: Map<string, { _id: string; _createdAt: string }>,
    allSlugs: string[],
  ): MatchResult {
    const normalized = this.normalizeUrl(gscUrl);
    const extractionResult = this.extractSlugWithDiagnostics(normalized);

    // Check if URL is outside path prefix
    if (extractionResult.outsidePrefix) {
      return {
        gscUrl,
        sanityId: undefined,
        confidence: "none",
        unmatchReason: "outside_path_prefix",
        diagnostics: {
          normalizedUrl: normalized,
          pathAfterPrefix: null,
          configuredPrefix: this.config.pathPrefix ?? null,
          availableSlugsCount: slugToDoc.size,
          similarSlugs: [],
        },
      };
    }

    const slug = extractionResult.slug;

    if (!slug) {
      return {
        gscUrl,
        sanityId: undefined,
        confidence: "none",
        unmatchReason: "no_slug_extracted",
        diagnostics: {
          normalizedUrl: normalized,
          pathAfterPrefix: extractionResult.pathAfterPrefix,
          configuredPrefix: this.config.pathPrefix ?? null,
          availableSlugsCount: slugToDoc.size,
          similarSlugs: [],
        },
      };
    }

    const exactMatch = slugToDoc.get(slug);
    if (exactMatch) {
      return {
        gscUrl,
        sanityId: exactMatch._id,
        confidence: "exact",
        matchedSlug: slug,
        unmatchReason: "matched",
        extractedSlug: slug,
      };
    }

    const withoutTrailing = slug.replace(/\/$/, "");
    const trailingMatch = slugToDoc.get(withoutTrailing);
    if (trailingMatch) {
      return {
        gscUrl,
        sanityId: trailingMatch._id,
        confidence: "normalized",
        matchedSlug: withoutTrailing,
        unmatchReason: "matched",
        extractedSlug: slug,
      };
    }

    const withTrailing = slug + "/";
    const addedTrailingMatch = slugToDoc.get(withTrailing);
    if (addedTrailingMatch) {
      return {
        gscUrl,
        sanityId: addedTrailingMatch._id,
        confidence: "normalized",
        matchedSlug: withTrailing,
        unmatchReason: "matched",
        extractedSlug: slug,
      };
    }

    // No match found - find similar slugs for suggestions
    const similarSlugs = this.findSimilarSlugs(slug, allSlugs, 3);

    return {
      gscUrl,
      sanityId: undefined,
      confidence: "none",
      unmatchReason: "no_matching_document",
      extractedSlug: slug,
      diagnostics: {
        normalizedUrl: normalized,
        pathAfterPrefix: extractionResult.pathAfterPrefix,
        configuredPrefix: this.config.pathPrefix ?? null,
        availableSlugsCount: slugToDoc.size,
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

  private extractSlug(normalizedUrl: string): string | undefined {
    return this.extractSlugWithDiagnostics(normalizedUrl).slug;
  }

  private extractSlugWithDiagnostics(normalizedUrl: string): {
    slug: string | undefined;
    pathAfterPrefix: string | null;
    outsidePrefix: boolean;
  } {
    try {
      const parsed = new URL(normalizedUrl);
      let path = parsed.pathname;

      // Check if the URL is outside the configured path prefix
      if (this.config.pathPrefix) {
        const prefixRegex = new RegExp(
          `^${this.escapeRegex(this.config.pathPrefix)}(/|$)`,
        );
        if (!prefixRegex.test(path)) {
          return {
            slug: undefined,
            pathAfterPrefix: null,
            outsidePrefix: true,
          };
        }
        path = path.replace(
          new RegExp(`^${this.escapeRegex(this.config.pathPrefix)}`),
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
