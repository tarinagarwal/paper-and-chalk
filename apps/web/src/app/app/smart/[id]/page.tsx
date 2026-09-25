import type { Metadata } from "next";

import { LibraryScreen } from "@/components/library/library-screen";
import { getRepositories } from "@/lib/server/clients";
import { orNotFound, pageActor } from "@/lib/server/library";
import { smartFolderView } from "@/lib/server/views";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function load(id: string) {
  const ctx = await pageActor();
  const smart = await orNotFound(getRepositories().smartFolders.get(ctx, id));
  const workspace = await getRepositories().workspaces.get(ctx, smart.workspaceId);
  return { smart, workspace };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { smart } = await load((await params).id);
  return { title: smart.name };
}

/** A saved filter set over the whole workspace. */
export default async function SmartFolderPage({ params, searchParams }: Props) {
  const { smart, workspace } = await load((await params).id);
  return (
    <LibraryScreen
      scope={{ kind: "home", workspaceId: smart.workspaceId }}
      title={smart.name}
      eyebrow={`${workspace.name} · Smart folder`}
      workspaceId={smart.workspaceId}
      searchParams={await searchParams}
      savedView={{ sort: smart.sort, dir: smart.dir, filters: smart.filters }}
      smartFolder={smartFolderView(smart)}
    />
  );
}
