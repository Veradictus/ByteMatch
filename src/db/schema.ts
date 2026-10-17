import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Confidence, StoredFunctional } from "../report/functional";
import type { Measures, ReportCategory } from "../report/types";

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
  login: text("login").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: created(),
});

/** A signed-in browser. The id is the SHA-256 of the cookie value; the GitHub token is encrypted. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    githubToken: text("github_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: created(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export type CategoryMeasures = Pick<ReportCategory, "id" | "name" | "measures">;

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    /** GitHub's repository id: survives renames and transfers. */
    githubId: bigint("github_id", { mode: "number" }).unique(),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name"),
    description: text("description"),
    /** Platform id, e.g. "gc", "ps2", "n64" (see src/lib/platforms.ts). */
    platform: text("platform"),
    defaultVersion: text("default_version"),
    defaultCategory: text("default_category"),
    defaultBranch: text("default_branch").notNull().default("main"),
    /** Artifact names that carry reports; the "version" group names the game version. */
    artifactPattern: text("artifact_pattern").notNull().default("^(?<version>.+)_report$"),
    /** Only read artifacts from this workflow file (e.g. "build.yml"); null reads all workflows. */
    workflow: text("workflow"),
    /** The report holds every version as top-level categories (objdiff's split convention). */
    splitVersions: boolean("split_versions").notNull().default(false),
    prComments: boolean("pr_comments").notNull().default(true),
    enabled: boolean("enabled").notNull().default(true),
    /** GitHub App installation that covers this repository, when there is one. */
    installationId: bigint("installation_id", { mode: "number" }),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    lastError: text("last_error"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    /** When the current run of errors began (lastErrorAt moves on every failure; this doesn't). */
    errorSince: timestamp("error_since", { withTimezone: true }),
    /** An https link to the project's cover (the banner on its page), hosted elsewhere; ByteMatch never stores images. */
    imageUrl: text("image_url"),
    /** An https link to the project's square icon (list thumbnail and next to its name), hosted elsewhere. */
    iconUrl: text("icon_url"),
    /** The project's Discord invite (discord.gg / discord.com/invite), shown on its page. */
    discordUrl: text("discord_url"),
    /**
     * The game this project decompiles, as its maintainers name it ("Ratchet & Clank"). Projects
     * naming the same game share a game page (see src/lib/games.ts); nothing else stores games.
     */
    game: text("game"),
    /** The series the game belongs to ("Ratchet & Clank"), for the franchise pages. */
    franchise: text("franchise"),
    /** The game's original release year. */
    releaseYear: integer("release_year"),
    /** The game's IGDB id, when its name was picked from IGDB: projects sharing one share a game page. */
    igdbId: integer("igdb_id"),
    /**
     * Versions that are a different game from the project's (one repository decompiling two games
     * on one engine): version → its game, franchise and release year. Versions not listed are the
     * project's game.
     */
    versionGames: jsonb("version_games").$type<Record<string, VersionGame>>().notNull().default({}),
    /**
     * When a maintainer last moved the project up "Recently updated" by hand, for work a report
     * doesn't show as progress (src/lib/bump.ts).
     */
    bumpedAt: timestamp("bumped_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("projects_owner_repo_idx").on(sql`lower(${t.owner})`, sql`lower(${t.repo})`)],
);

/** A full report, stored once however many commits share it: gzip of the objdiff protobuf. */
export const reportBlobs = pgTable("report_blobs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sha256: text("sha256").notNull().unique(),
  data: bytea("data").notNull(),
  size: integer("size").notNull(),
  createdAt: created(),
});

/** One version's progress at one commit. Measures are kept forever; the full report may expire. */
/** Functional lists (function name → confidence), stored once per distinct list. */
export const functionalLists = pgTable("functional_lists", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sha256: text("sha256").notNull().unique(),
  entries: jsonb("entries").$type<Record<string, Confidence>>().notNull(),
  createdAt: created(),
});

export const reports = pgTable(
  "reports",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    commitSha: text("commit_sha").notNull(),
    commitMessage: text("commit_message"),
    commitTimestamp: timestamp("commit_timestamp", { withTimezone: true }).notNull(),
    /**
     * "artifact" (CI artifact), "upload" (upload API), "import" (decomp.dev history) or "history"
     * (a history file the maintainers uploaded). The last two carry measures only.
     */
    source: text("source").notNull(),
    runId: bigint("run_id", { mode: "number" }),
    measures: jsonb("measures").$type<Measures>().notNull(),
    categories: jsonb("categories").$type<CategoryMeasures[]>().notNull().default([]),
    blobId: bigint("blob_id", { mode: "number" }).references(() => reportBlobs.id, { onDelete: "set null" }),
    /** What the project's functional list adds up to (never progress), or why it couldn't be read. */
    functional: jsonb("functional").$type<StoredFunctional>(),
    functionalListId: bigint("functional_list_id", { mode: "number" }).references(() => functionalLists.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("reports_project_version_commit_idx").on(t.projectId, t.version, t.commitSha),
    index("reports_project_version_time_idx").on(t.projectId, t.version, t.commitTimestamp.desc()),
  ],
);

/** Per-project upload tokens: only a hash is stored. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** The first characters, so owners can tell tokens apart. */
    prefix: text("prefix").notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("api_tokens_project_idx").on(t.projectId)],
);

/** The progress comment on each pull request, so later runs edit it instead of adding more. */
export const prComments = pgTable(
  "pr_comments",
  {
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    commentId: bigint("comment_id", { mode: "number" }).notNull(),
    headSha: text("head_sha"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pr_comments_project_pr_idx").on(t.projectId, t.prNumber)],
);

/** GitHub accounts that may not sign in or submit projects. Matched by id, or by login before first sign-in. */
export const blockedAccounts = pgTable(
  "blocked_accounts",
  {
    id: serial("id").primaryKey(),
    login: text("login").notNull(),
    githubId: bigint("github_id", { mode: "number" }),
    reason: text("reason"),
    blockedBy: integer("blocked_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("blocked_accounts_login_idx").on(sql`lower(${t.login})`)],
);

/**
 * Admins appointed from the panel. Owners (ADMIN_GITHUB_LOGINS) are not stored here: they come from
 * the server's configuration, so nothing done in the panel can remove them.
 */
export const siteAdmins = pgTable(
  "site_admins",
  {
    id: serial("id").primaryKey(),
    login: text("login").notNull(),
    githubId: bigint("github_id", { mode: "number" }),
    appointedBy: integer("appointed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("site_admins_login_idx").on(sql`lower(${t.login})`)],
);

/** Who did what in the admin panel. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorLogin: text("actor_login").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: created(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt.desc())],
);

/** Instance switches set from the admin panel, and the worker's heartbeat. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Names that mean the same game (or franchise) although they're spelled differently enough that
 * gameKey keeps them apart ("Ratchet & Clank 2" and "Ratchet & Clank: Going Commando"). Set by
 * admins; projects naming either then share one page, and the old page's URL redirects.
 */
export const nameAliases = pgTable(
  "name_aliases",
  {
    kind: text("kind").$type<"game" | "franchise">().notNull(),
    /** gameKey of the merged name. */
    fromKey: text("from_key").notNull(),
    /** The name as it was typed, for showing and for its old URL. */
    fromName: text("from_name").notNull(),
    toKey: text("to_key").notNull(),
    toName: text("to_name").notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.fromKey] })],
);

/**
 * CI runs whose report artifact couldn't be used (no report in it, unreadable, too big). A finished
 * run's artifacts never change, so polls skip these instead of failing on them every time; the
 * manage page explains them and can clear them to try again.
 */
export const ingestProblems = pgTable(
  "ingest_problems",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: bigint("run_id", { mode: "number" }).notNull(),
    commitSha: text("commit_sha").notNull(),
    artifact: text("artifact").notNull(),
    code: text("code").notNull(),
    message: text("message").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [uniqueIndex("ingest_problems_run_artifact_idx").on(t.projectId, t.runId, t.artifact)],
);

/**
 * Custom themes shared by code ("brave-otter-12"). Anyone may share one, without signing in; a theme
 * is identified by its content, so the same colours, style and name always get the same code, and
 * editing a theme gives it a new one.
 */
export const sharedThemes = pgTable(
  "shared_themes",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    palette: jsonb("palette").$type<Record<string, string>>().notNull(),
    style: jsonb("style").$type<Record<string, string>>().notNull(),
    /** SHA-256 of the theme's canonical text, so identical themes share one code. */
    contentHash: text("content_hash").notNull().unique(),
    /** A salted hash of the sharer's address (or of "no address"), only for the hourly limit and moderation. */
    sharerHash: text("sharer_hash"),
    createdAt: created(),
    /** Last shared, opened, added or still saved by someone; codes unused for long are pruned. */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    /** Removed by a moderator: the code stops working and the same theme can't be shared again. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [
    index("shared_themes_sharer_idx").on(t.sharerHash, t.createdAt),
    index("shared_themes_created_idx").on(t.createdAt),
    index("shared_themes_used_idx").on(t.lastUsedAt),
  ],
);

/*
 * Traffic, for the admin Statistics page. No cookies and no addresses: a visitor is a hash of the
 * day, the instance's secret, their address and their browser, so the same person can't be linked
 * across days, and the hashes themselves are deleted once each day's count is rolled up.
 */

/** Today's (and yesterday's) distinct visitors, as day-salted hashes; rolled up nightly. */
export const trafficVisitors = pgTable(
  "traffic_visitors",
  {
    day: date("day").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.hash] })],
);

/** Distinct visitors per day, for days already rolled up. */
export const trafficDays = pgTable("traffic_days", {
  day: date("day").primaryKey(),
  visitors: integer("visitors").notNull(),
});

/** Page views per day and path. */
export const trafficPages = pgTable(
  "traffic_pages",
  {
    day: date("day").notNull(),
    path: text("path").notNull(),
    views: integer("views").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.path] })],
);

/** Arrivals per day from other sites, by host. */
export const trafficReferrers = pgTable(
  "traffic_referrers",
  {
    day: date("day").notNull(),
    host: text("host").notNull(),
    visits: integer("visits").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.host] })],
);

/**
 * Ports built from a project's decompilation (a native PC version, say), listed by its maintainers
 * on the project's page, its game's page and /ports. ByteMatch only links to them.
 */
export const ports = pgTable(
  "ports",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Its home: a repository, releases page or website (https). */
    url: text("url").notNull(),
    /** Ids from PORT_PLATFORMS (src/lib/ports.ts). */
    platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
    /** One of PORT_STATUSES. */
    status: text("status").notNull(),
    /** The version it's built from, when it's one of several (and so which game, for a repository of several). */
    version: text("version"),
    note: text("note"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [index("ports_project_idx").on(t.projectId)],
);

export interface VersionGame {
  game: string;
  franchise?: string | null;
  releaseYear?: number | null;
}

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ReportRow = typeof reports.$inferSelect;
export type User = typeof users.$inferSelect;
export type Port = typeof ports.$inferSelect;
