CREATE TABLE IF NOT EXISTS "biometric_selfies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "encrypted_data" jsonb NOT NULL,
  "content_type" text NOT NULL,
  "sha256" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "biometric_selfies_user_status_idx" ON "biometric_selfies" ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "biometric_selfies_created_at_idx" ON "biometric_selfies" ("created_at");
