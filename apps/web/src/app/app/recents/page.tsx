import type { Metadata } from "next";

import { LibraryScreen } from "@/components/library/library-screen";

export const metadata: Metadata = { title: "Recents" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** What the user opened last, across their workspaces. */
export default async function RecentsPage({ searchParams }: Props) {
  return (
    <LibraryScreen
      scope={{ kind: "recents" }}
      title="Recents"
      eyebrow="Library"
      workspaceId={null}
      searchParams={await searchParams}
    />
  );
}
