import { LibraryScreen } from "@/components/library/library-screen";
import { libraryWorkspaces, pageActor } from "@/lib/server/library";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Home: every document in the current workspace. */
export default async function HomePage({ searchParams }: Props) {
  const { active } = await libraryWorkspaces(await pageActor());
  return (
    <LibraryScreen
      scope={{ kind: "home", workspaceId: active.id }}
      title="Home"
      eyebrow={active.name}
      workspaceId={active.id}
      searchParams={await searchParams}
    />
  );
}
