import type { Metadata } from "next";

import { LibraryScreen } from "@/components/library/library-screen";
import { libraryWorkspaces, pageActor } from "@/lib/server/library";

export const metadata: Metadata = { title: "Trash" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Trashed documents in the current workspace that the user may restore or delete forever. */
export default async function TrashPage({ searchParams }: Props) {
  const { active } = await libraryWorkspaces(await pageActor());
  return (
    <LibraryScreen
      scope={{ kind: "trash", workspaceId: active.id }}
      title="Trash"
      eyebrow={active.name}
      workspaceId={active.id}
      searchParams={await searchParams}
    />
  );
}
