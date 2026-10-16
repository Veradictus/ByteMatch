import { afterAll, beforeAll, beforeEach } from "vitest";
import type { NewProject } from "../src/db/schema";
import { resetConfig } from "../src/lib/config";

/**
 * Database tests run against TEST_DATABASE_URL (a database they may wipe), e.g.
 * postgres://bytematch:bytematch@localhost:5432/bytematch_test from `docker compose up -d db`.
 * Without it they are skipped.
 */
export const TEST_DB = process.env.TEST_DATABASE_URL;

export function useTestDb() {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    resetConfig();
    const { runMigrations } = await import("../src/db/migrate");
    await runMigrations();
  });
  beforeEach(async () => {
    const { sql } = await import("../src/db/client");
    await sql().unsafe(
      "truncate users, sessions, projects, report_blobs, reports, api_tokens, pr_comments, blocked_accounts, audit_log, settings, site_admins, shared_themes, ingest_problems, name_aliases, traffic_visitors, traffic_days, traffic_pages, traffic_referrers restart identity cascade",
    );
  });
  afterAll(async () => {
    const { closeDb } = await import("../src/db/client");
    await closeDb();
  });
}

export async function makeProject(values: Partial<NewProject> = {}) {
  const { db } = await import("../src/db/client");
  const { projects } = await import("../src/db/schema");
  const [p] = await db()
    .insert(projects)
    .values({ owner: "OpenRAC", repo: "rac1-decomp", name: "Ratchet & Clank (PAL)", platform: "ps2", githubId: 1361920188, ...values })
    .returning();
  return p;
}
