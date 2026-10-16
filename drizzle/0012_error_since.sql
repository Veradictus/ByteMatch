ALTER TABLE "projects" ADD COLUMN "error_since" timestamp with time zone;--> statement-breakpoint
-- Rows already in error: start their clock at their last error.
UPDATE "projects" SET "error_since" = "last_error_at" WHERE "last_error" IS NOT NULL;
