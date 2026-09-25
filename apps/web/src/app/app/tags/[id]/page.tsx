import type { Metadata } from "next";

import { LibraryScreen } from "@/components/library/library-screen";
import { getRepositories } from "@/lib/server/clients";
import { orNotFound, pageActor } from "@/lib/server/library";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function load(id: string) {
  const ctx = await pageActor();
  const tag = await orNotFound(getRepositories().tags.get(ctx, id));
  const workspace = await getRepositories().workspaces.get(ctx, tag.workspaceId);
  return { tag, workspace };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await load((await params).id);
  return { title: tag.name };
}

/** Documents carrying one tag. */
export default async function TagPage({ params, searchParams }: Props) {
  const { tag, workspace } = await load((await params).id);
  return (
    <LibraryScreen
      scope={{ kind: "tag", tagId: tag._id }}
      title={tag.name}
      eyebrow={`${workspace.name} · Tag`}
      workspaceId={tag.workspaceId}
      searchParams={await searchParams}
    />
  );
}
