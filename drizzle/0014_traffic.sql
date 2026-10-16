CREATE TABLE "traffic_days" (
	"day" date PRIMARY KEY NOT NULL,
	"visitors" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_pages" (
	"day" date NOT NULL,
	"path" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "traffic_pages_day_path_pk" PRIMARY KEY("day","path")
);
--> statement-breakpoint
CREATE TABLE "traffic_referrers" (
	"day" date NOT NULL,
	"host" text NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "traffic_referrers_day_host_pk" PRIMARY KEY("day","host")
);
--> statement-breakpoint
CREATE TABLE "traffic_visitors" (
	"day" date NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "traffic_visitors_day_hash_pk" PRIMARY KEY("day","hash")
);
