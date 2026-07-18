CREATE TABLE IF NOT EXISTS "rate_limit_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limit_entries_key_idx" ON "rate_limit_entries" ("key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limit_entries_key_created_at_idx" ON "rate_limit_entries" ("key", "created_at");