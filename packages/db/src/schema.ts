import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";

export const searchAnalytics = pgTable(
  "search_analytics",
  {
    id: text("id").primaryKey(), // `${siteId}:${page}:${date}`
    siteId: text("site_id").notNull(),
    page: text("page").notNull(),
    date: date("date").notNull(),
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    ctr: real("ctr").notNull().default(0),
    position: real("position").notNull().default(0),
    fetchedAt: timestamp("fetched_at").defaultNow(),
  },
  (table) => [
    index("site_page_idx").on(table.siteId, table.page),
    index("site_date_idx").on(table.siteId, table.date),
  ],
);

export const queryAnalytics = pgTable(
  "query_analytics",
  {
    id: text("id").primaryKey(), // `${siteId}:${page}:${query}:${date}`
    siteId: text("site_id").notNull(),
    page: text("page").notNull(),
    query: text("query").notNull(),
    date: date("date").notNull(),
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    ctr: real("ctr").notNull().default(0),
    position: real("position").notNull().default(0),
  },
  (table) => [
    index("site_page_query_idx").on(table.siteId, table.page, table.query),
  ],
);

export const syncLog = pgTable("sync_log", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  rowsProcessed: integer("rows_processed"),
  status: text("status").notNull(), // 'running' | 'completed' | 'failed'
  error: text("error"),
});

export const pageIndexStatus = pgTable(
  "page_index_status",
  {
    id: text("id").primaryKey(), // `${siteId}:${page}`
    siteId: text("site_id").notNull(),
    page: text("page").notNull(),
    verdict: text("verdict").notNull(), // 'PASS' | 'FAIL' | 'NEUTRAL'
    coverageState: text("coverage_state"),
    indexingState: text("indexing_state"),
    pageFetchState: text("page_fetch_state"),
    lastCrawlTime: timestamp("last_crawl_time"),
    robotsTxtState: text("robots_txt_state"),
    fetchedAt: timestamp("fetched_at").defaultNow(),
  },
  (table) => [index("page_index_site_idx").on(table.siteId, table.page)],
);

export const unmatchDiagnostics = pgTable(
  "unmatch_diagnostics",
  {
    id: text("id").primaryKey(), // `${siteId}:${gscUrl}`
    siteId: text("site_id").notNull(),
    gscUrl: text("gsc_url").notNull(),
    extractedSlug: text("extracted_slug"),
    unmatchReason: text("unmatch_reason").notNull(), // 'no_slug_extracted' | 'no_matching_document' | 'outside_path_prefix'
    normalizedUrl: text("normalized_url"),
    pathAfterPrefix: text("path_after_prefix"),
    configuredPrefix: text("configured_prefix"),
    similarSlugs: text("similar_slugs"), // JSON array of similar slug suggestions
    availableSlugsCount: integer("available_slugs_count"),
    lastSeenAt: timestamp("last_seen_at").defaultNow(),
    firstSeenAt: timestamp("first_seen_at").defaultNow(),
  },
  (table) => [
    index("unmatch_site_idx").on(table.siteId),
    index("unmatch_reason_idx").on(table.siteId, table.unmatchReason),
  ],
);

export type SearchAnalytics = typeof searchAnalytics.$inferSelect;
export type NewSearchAnalytics = typeof searchAnalytics.$inferInsert;
export type QueryAnalytics = typeof queryAnalytics.$inferSelect;
export type NewQueryAnalytics = typeof queryAnalytics.$inferInsert;
export type SyncLog = typeof syncLog.$inferSelect;
export type NewSyncLog = typeof syncLog.$inferInsert;
export type PageIndexStatus = typeof pageIndexStatus.$inferSelect;
export type NewPageIndexStatus = typeof pageIndexStatus.$inferInsert;
export type UnmatchDiagnostics = typeof unmatchDiagnostics.$inferSelect;
export type NewUnmatchDiagnostics = typeof unmatchDiagnostics.$inferInsert;
