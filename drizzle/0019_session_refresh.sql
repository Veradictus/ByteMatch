ALTER TABLE "sessions" ADD COLUMN "github_refresh_token" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "github_token_expires_at" timestamp with time zone;