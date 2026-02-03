import { google, type searchconsole_v1 } from "googleapis";
import type { JWT } from "google-auth-library";

export interface GSCClientOptions {
  credentials: {
    client_email: string;
    private_key: string;
  };
}

export interface SearchAnalyticsRow {
  page: string;
  query?: string;
  date?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface FetchOptions {
  siteUrl: string;
  startDate: Date;
  endDate: Date;
  dimensions?: ("page" | "query" | "date")[];
  rowLimit?: number;
}

export class GSCClient {
  private auth: JWT;
  private searchConsole: searchconsole_v1.Searchconsole;

  constructor(options: GSCClientOptions) {
    this.auth = new google.auth.JWT({
      email: options.credentials.client_email,
      key: options.credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    });

    this.searchConsole = google.searchconsole({
      version: "v1",
      auth: this.auth,
    });
  }

  async fetchSearchAnalytics(options: FetchOptions): Promise<SearchAnalyticsRow[]> {
    const { siteUrl, startDate, endDate, dimensions = ["page", "date"], rowLimit = 25000 } = options;

    const rows: SearchAnalyticsRow[] = [];
    let startRow = 0;

    while (true) {
      const response = await this.searchConsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions,
          rowLimit,
          startRow,
        },
      });

      const responseRows = response.data.rows ?? [];
      if (responseRows.length === 0) break;

      for (const row of responseRows) {
        const keys = row.keys ?? [];
        rows.push({
          page: dimensions.includes("page") ? keys[dimensions.indexOf("page")]! : "",
          query: dimensions.includes("query") ? keys[dimensions.indexOf("query")] : undefined,
          date: dimensions.includes("date") ? keys[dimensions.indexOf("date")] : undefined,
          clicks: row.clicks ?? 0,
          impressions: row.impressions ?? 0,
          ctr: row.ctr ?? 0,
          position: row.position ?? 0,
        });
      }

      if (responseRows.length < rowLimit) break;
      startRow += rowLimit;
    }

    return rows;
  }

  async listSites(): Promise<string[]> {
    const response = await this.searchConsole.sites.list();
    return (response.data.siteEntry ?? []).map((site) => site.siteUrl!).filter(Boolean);
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}
