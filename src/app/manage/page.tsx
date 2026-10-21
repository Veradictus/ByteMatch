import { desc, eq } from "drizzle-orm";
import { explain, problemCode } from "@/lib/problems";
import Link from "next/link";
import { config } from "@/lib/config";
import { redirect } from "next/navigation";
import { currentSession } from "@/auth/session";
import { db } from "@/db/client";
import { projects } from "@/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage" };

export default async function Manage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const session = await currentSession();
  if (!session) redirect("/login?next=/manage");
  const list = await db().select().from(projects).where(eq(projects.createdBy, session.user.id)).orderBy(desc(projects.updatedAt));
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Manage</h1>
        <Link href="/manage/new" className="btn btn-primary ml-auto">
          Submit a project
        </Link>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        Projects you submitted. To manage another, submit it: you need admin rights on its repository.
      </p>
      {deleted ? (
        <p className="mt-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2" role="status">
          Deleted <span className="font-mono">{deleted}</span> from {config().SITE_NAME}.
        </p>
      ) : null}
      <ul className="panel mt-6 divide-y divide-line overflow-hidden">
        {list.map((p) => (
          <li key={p.id}>
            <Link href={`/manage/${p.owner}/${p.repo}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-ink-3">
                {p.owner}/{p.repo}
              </span>
              {!p.enabled ? <span className="text-xs text-ink-3">disabled</span> : null}
              {p.lastError ? <span className="ml-auto text-xs text-bad">{explain(problemCode(p.lastError)).title}</span> : null}
            </Link>
          </li>
        ))}
        {list.length === 0 ? <li className="px-4 py-8 text-center text-sm text-ink-3">No projects yet.</li> : null}
      </ul>
    </div>
  );
}
