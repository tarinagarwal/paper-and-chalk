import type { Metadata } from "next";

import { LibraryScreen } from "@/components/library/library-screen";
import { libraryWorkspaces, pageActor } from "@/lib/server/library";

export const metadata: Metadata = { title: "Search" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Every title match in the current workspace, with the full library actions. */
export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const { active } = await libraryWorkspaces(await pageActor());
  if (!q) {
    return (
      <div className="flex flex-1 flex-col gap-2 px-4 pt-8 sm:px-8">
        <p className="eyebrow text-muted-foreground">{active.name}</p>
        <h1 className="font-display text-[2.25rem] leading-tight tracking-[-0.015em]">Search</h1>
        <p className="text-muted-foreground">
          Type in the search box above to find documents by title.
        </p>
      </div>
    );
  }
  return (
    <LibraryScreen
      scope={{ kind: "search", workspaceId: active.id, q }}
      title={`“${q}”`}
      eyebrow={`${active.name} · Search`}
      workspaceId={active.id}
      searchParams={params}
    />
  );
}
