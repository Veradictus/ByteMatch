ALTER TABLE "projects" ADD COLUMN "version_labels" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "version_order" jsonb DEFAULT '[]'::jsonb NOT NULL;