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

export type SearchAnalytics = typeof searchAnalytics.$inferSelect;
export type NewSearchAnalytics = typeof searchAnalytics.$inferInsert;
export type QueryAnalytics = typeof queryAnalytics.$inferSelect;
export type NewQueryAnalytics = typeof queryAnalytics.$inferInsert;
export type SyncLog = typeof syncLog.$inferSelect;
export type NewSyncLog = typeof syncLog.$inferInsert;
