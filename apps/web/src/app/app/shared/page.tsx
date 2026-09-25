import type { Metadata } from "next";

import { LibraryScreen } from "@/components/library/library-screen";

export const metadata: Metadata = { title: "Shared with me" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Documents other people shared with the user, outside the user's workspaces. */
export default async function SharedPage({ searchParams }: Props) {
  return (
    <LibraryScreen
      scope={{ kind: "shared" }}
      title="Shared with me"
      eyebrow="Library"
      workspaceId={null}
      searchParams={await searchParams}
    />
  );
}
