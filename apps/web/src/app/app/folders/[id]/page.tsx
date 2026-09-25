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
  const folder = await orNotFound(getRepositories().folders.get(ctx, id));
  const workspace = await getRepositories().workspaces.get(ctx, folder.workspaceId);
  return { folder, workspace };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { folder } = await load((await params).id);
  return { title: folder.name };
}

/** Documents in one folder. */
export default async function FolderPage({ params, searchParams }: Props) {
  const { folder, workspace } = await load((await params).id);
  return (
    <LibraryScreen
      scope={{ kind: "folder", folderId: folder._id }}
      title={folder.name}
      eyebrow={workspace.name}
      workspaceId={folder.workspaceId}
      searchParams={await searchParams}
    />
  );
}
