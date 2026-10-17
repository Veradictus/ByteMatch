import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { ports, projects, type Port, type Project } from "./schema";
import { MAX_PORTS, PORT_STATUSES, type PortInput } from "../lib/ports";

/** Most finished first, then oldest listed. */
const statusRank = sql`array_position(array[${sql.join(
  Object.keys(PORT_STATUSES).map((s) => sql`${s}`),
  sql`, `,
)}]::text[], ${ports.status})`;

export async function projectPorts(projectId: number): Promise<Port[]> {
  return db().select().from(ports).where(eq(ports.projectId, projectId)).orderBy(statusRank, asc(ports.createdAt), asc(ports.id));
}

export type ListedPort = Port & { project: Pick<Project, "owner" | "repo" | "name" | "game" | "versionGames"> };

/** Every port of an enabled project; callers keep those whose project is public. */
export async function allPorts(): Promise<ListedPort[]> {
  const rows = await db()
    .select({
      port: ports,
      project: {
        owner: projects.owner,
        repo: projects.repo,
        name: projects.name,
        game: projects.game,
        versionGames: projects.versionGames,
      },
    })
    .from(ports)
    .innerJoin(projects, eq(projects.id, ports.projectId))
    .where(eq(projects.enabled, true))
    .orderBy(statusRank, asc(ports.createdAt), asc(ports.id));
  return rows.map((r) => ({ ...r.port, project: r.project }));
}

export class PortLimitError extends Error {}

export async function addPort(projectId: number, input: PortInput, userId: number | null): Promise<Port> {
  return db().transaction(async (tx) => {
    // One at a time per project, so two quick adds can't both pass the limit.
    await tx.execute(sql`select 1 from ${projects} where ${projects.id} = ${projectId} for update`);
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(ports)
      .where(eq(ports.projectId, projectId));
    if (n >= MAX_PORTS) throw new PortLimitError(`A project can list up to ${MAX_PORTS} ports.`);
    const [row] = await tx
      .insert(ports)
      .values({ projectId, ...input, createdBy: userId })
      .returning();
    return row;
  });
}

export async function removePort(projectId: number, id: number): Promise<boolean> {
  const gone = await db()
    .delete(ports)
    .where(and(eq(ports.projectId, projectId), eq(ports.id, id)))
    .returning({ id: ports.id });
  return gone.length > 0;
}
