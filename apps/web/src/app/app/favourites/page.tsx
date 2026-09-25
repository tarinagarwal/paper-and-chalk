import type { Metadata } from "next";

import { LibraryScreen } from "@/components/library/library-screen";

export const metadata: Metadata = { title: "Favourites" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FavouritesPage({ searchParams }: Props) {
  return (
    <LibraryScreen
      scope={{ kind: "favourites" }}
      title="Favourites"
      eyebrow="Library"
      workspaceId={null}
      searchParams={await searchParams}
    />
  );
}
