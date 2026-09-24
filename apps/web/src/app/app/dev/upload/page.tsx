import { atLeast } from "@pc/schema";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { env } from "@/env";
import { getSession } from "@/lib/auth";
import { getRepositories } from "@/lib/server/clients";

import { UploadLab } from "./upload-lab";

export const metadata: Metadata = { title: "Upload test" };

/** Temporary page to exercise uploads (step 5). Removed in step 8; never served in production. */
export default async function DevUploadPage() {
  if (env.APP_ENV === "production") notFound();
  const session = await getSession();
  if (!session) notFound();

  const workspaces = await getRepositories().workspaces.listForActor({
    actor: { kind: "user", userId: session.user.id, email: session.user.email },
  });
  return (
    <UploadLab
      workspaces={workspaces.map((w) => ({
        id: w._id,
        name: w.personal ? "Personal" : w.name,
        canUpload: atLeast(w.role, "editor"),
      }))}
    />
  );
}
