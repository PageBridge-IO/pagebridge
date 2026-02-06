CREATE TABLE "unmatch_diagnostics" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"gsc_url" text NOT NULL,
	"extracted_slug" text,
	"unmatch_reason" text NOT NULL,
	"normalized_url" text,
	"path_after_prefix" text,
	"configured_prefix" text,
	"similar_slugs" text,
	"available_slugs_count" integer,
	"last_seen_at" timestamp DEFAULT now(),
	"first_seen_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "unmatch_site_idx" ON "unmatch_diagnostics" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "unmatch_reason_idx" ON "unmatch_diagnostics" USING btree ("site_id","unmatch_reason");