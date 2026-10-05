import type { Metadata } from "next";
import { cache } from "react";

import { DocumentViewer, type ViewerDocument } from "@/components/document/document-viewer";
import { getRepositories } from "@/lib/server/clients";
import { orNotFound, pageActor } from "@/lib/server/library";

interface Props {
  params: Promise<{ id: string }>;
}

/** Loads the document once per request (metadata and page share it) and records the open. */
const load = cache(async (id: string): Promise<ViewerDocument> => {
  const ctx = await pageActor();
  const repos = getRepositories();
  const document = await orNotFound(repos.documents.get(ctx, id));
  const trashed = document.deletedAt !== null;
  const pages = trashed ? [] : await repos.pages.list(ctx, id);
  if (!trashed) await repos.documents.recordOpen(ctx, id);
  return {
    id: document._id,
    title: document.title,
    type: document.type,
    workspaceId: document.workspaceId,
    folderId: document.folderId,
    trashed,
    canvasBackground: document.canvasBackground,
    sources: document.sources,
    pages: pages.map((page) => ({
      id: page._id,
      widthPt: page.widthPt,
      heightPt: page.heightPt,
      background: page.background,
    })),
  };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const document = await load((await params).id);
  return { title: document.title };
}

/** A document (SPEC.md section 6): its pages drawn from their specs. The editor comes later. */
export default async function DocumentPage({ params }: Props) {
  const document = await load((await params).id);
  return <DocumentViewer document={document} />;
}
