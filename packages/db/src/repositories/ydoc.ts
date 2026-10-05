/**
 * The document's meta Y.Doc (SPEC.md section 3): `doc:{documentId}:meta` holds the page list, doc
 * settings and layer definitions. A new document gets its first update here, so the sync server
 * (step 14) starts from a real doc rather than an empty one.
 */
import { yjsUpdateRecordSchema, type CanvasBackground, type YjsUpdateRecord } from "@pc/schema";
import * as Y from "yjs";

import { newId } from "../ids";

export const metaDocName = (documentId: string) => `doc:${documentId}:meta`;

export function metaDocStub(
  input: {
    documentId: string;
    type: "notebook" | "canvas" | "pdf";
    pageIds: readonly string[];
    canvasBackground: CanvasBackground | null;
  },
  now: Date,
): YjsUpdateRecord {
  const doc = new Y.Doc();
  doc.transact(() => {
    doc.getArray<string>("pages").push([...input.pageIds]);
    const settings = doc.getMap<unknown>("settings");
    settings.set("type", input.type);
    if (input.canvasBackground) settings.set("canvasBackground", { ...input.canvasBackground });
    doc
      .getArray<Record<string, unknown>>("layers")
      .push([{ id: newId(), name: "Layer 1", visible: true, locked: false, ownerOnly: false }]);
  });
  return yjsUpdateRecordSchema.parse({
    _id: newId(),
    docName: metaDocName(input.documentId),
    documentId: input.documentId,
    seq: 0,
    update: Y.encodeStateAsUpdate(doc),
    createdAt: now,
  });
}

/** Reads a meta doc back (tests, and the viewer's page order until the sync server exists). */
export function readMetaDoc(update: Uint8Array): {
  pages: string[];
  settings: Record<string, unknown>;
  layers: Record<string, unknown>[];
} {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  return {
    pages: doc.getArray<string>("pages").toArray(),
    settings: doc.getMap<unknown>("settings").toJSON(),
    layers: doc.getArray<Record<string, unknown>>("layers").toArray(),
  };
}
