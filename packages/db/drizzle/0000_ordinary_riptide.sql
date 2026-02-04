CREATE TABLE IF NOT EXISTS "page_index_status" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"page" text NOT NULL,
	"verdict" text NOT NULL,
	"coverage_state" text,
	"indexing_state" text,
	"page_fetch_state" text,
	"last_crawl_time" timestamp,
	"robots_txt_state" text,
	"fetched_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "query_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"page" text NOT NULL,
	"query" text NOT NULL,
	"date" date NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"ctr" real DEFAULT 0 NOT NULL,
	"position" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "search_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"page" text NOT NULL,
	"date" date NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"ctr" real DEFAULT 0 NOT NULL,
	"position" real DEFAULT 0 NOT NULL,
	"fetched_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_log" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"rows_processed" integer,
	"status" text NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_index_site_idx" ON "page_index_status" USING btree ("site_id","page");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_page_query_idx" ON "query_analytics" USING btree ("site_id","page","query");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_page_idx" ON "search_analytics" USING btree ("site_id","page");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_date_idx" ON "search_analytics" USING btree ("site_id","date");