import type { Metadata } from "next";
import { ProjectView } from "@/components/project-view";
import { findProject, hasImportedHistory } from "@/db/store";
import { projectMetadataFor } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ owner: string; repo: string; version: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { owner, repo, version } = await params;
  const project = await findProject(owner, repo).catch(() => undefined);
  const importedFromDecompDev = project ? await hasImportedHistory(project.id).catch(() => false) : false;
  return projectMetadataFor(owner, repo, version, { importedFromDecompDev });
}

export default async function Page({
  params,
  searchParams,
}: Params & { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { owner, repo, version } = await params;
  const commit = (await searchParams).commit;
  return <ProjectView owner={owner} repo={repo} version={version} commit={typeof commit === "string" ? commit : undefined} />;
}
