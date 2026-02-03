import type { SanityClient } from "@sanity/client";

export interface MatchResult {
  gscUrl: string;
  sanityId: string | undefined;
  confidence: "exact" | "normalized" | "fuzzy" | "none";
  matchedSlug?: string;
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
    for (const doc of documents) {
      const slug = doc[this.config.slugField] as string | undefined;
      if (slug) {
        slugToDoc.set(this.normalizeSlug(slug), doc);
      }
    }

    return gscUrls.map((url) => this.matchSingleUrl(url, slugToDoc));
  }

  private matchSingleUrl(
    gscUrl: string,
    slugToDoc: Map<string, { _id: string; _createdAt: string }>,
  ): MatchResult {
    const normalized = this.normalizeUrl(gscUrl);
    const slug = this.extractSlug(normalized);

    if (!slug) {
      return { gscUrl, sanityId: undefined, confidence: "none" };
    }

    const exactMatch = slugToDoc.get(slug);
    if (exactMatch) {
      return {
        gscUrl,
        sanityId: exactMatch._id,
        confidence: "exact",
        matchedSlug: slug,
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
      };
    }

    return { gscUrl, sanityId: undefined, confidence: "none" };
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
    try {
      const parsed = new URL(normalizedUrl);
      let path = parsed.pathname;

      if (this.config.pathPrefix) {
        path = path.replace(new RegExp(`^${this.config.pathPrefix}`), "");
      }

      const slug = path.replace(/^\/+|\/+$/g, "");
      return slug || undefined;
    } catch {
      return undefined;
    }
  }

  private normalizeSlug(slug: string): string {
    return slug.replace(/^\/+|\/+$/g, "").toLowerCase();
  }
}
