import { DOCUMENT_ACTIONS, ROLES, type DocumentAction, type Role } from "@pc/schema";
import { describe, expect, it } from "vitest";

import {
  decideDocument,
  decideFolder,
  decideLayer,
  decidePage,
  decideSmartFolder,
  decideWorkspace,
  type DocumentFacts,
  type LinkFacts,
} from "./decide";

const now = new Date("2026-09-24T12:00:00Z");
const past = new Date("2026-09-01T00:00:00Z");
const future = new Date("2026-12-01T00:00:00Z");

const facts = (overrides: Partial<DocumentFacts> = {}): DocumentFacts => ({
  now,
  isGuest: false,
  workspaceRole: null,
  grants: [],
  link: null,
  deleted: false,
  editorsCanShare: false,
  ...overrides,
});

const link = (overrides: Partial<LinkFacts> = {}): LinkFacts => ({
  role: "viewer",
  expiresAt: null,
  revoked: false,
  requireSignIn: false,
  allowDownload: true,
  passwordRequired: false,
  passwordVerified: false,
  ...overrides,
});

/**
 * The roles table from SPEC.md section 4. "If allowed" (editor sharing) depends on the document's
 * editorsCanShare switch and is tested separately.
 */
const TABLE: Record<
  Role,
  Record<"view" | "comment" | "edit" | "managePages" | "delete", boolean>
> = {
  owner: { view: true, comment: true, edit: true, managePages: true, delete: true },
  editor: { view: true, comment: true, edit: true, managePages: true, delete: false },
  commenter: { view: true, comment: true, edit: false, managePages: false, delete: false },
  viewer: { view: true, comment: false, edit: false, managePages: false, delete: false },
};
const SHARE: Record<Role, { allowed: boolean; ifAllowed: boolean }> = {
  owner: { allowed: true, ifAllowed: true },
  editor: { allowed: false, ifAllowed: true },
  commenter: { allowed: false, ifAllowed: false },
  viewer: { allowed: false, ifAllowed: false },
};

/** Every way a signed-in user can hold a role on a document. Share links stop at editor. */
const SOURCES: Record<string, { roles: readonly Role[]; make: (role: Role) => DocumentFacts }> = {
  "workspace role": { roles: ROLES, make: (role) => facts({ workspaceRole: role }) },
  "user grant": { roles: ROLES, make: (role) => facts({ grants: [{ role, expiresAt: null }] }) },
  "unexpired grant": {
    roles: ROLES,
    make: (role) => facts({ grants: [{ role, expiresAt: future }] }),
  },
  "share link": {
    roles: ["editor", "commenter", "viewer"],
    make: (role) => facts({ link: link({ role: role === "owner" ? "editor" : role }) }),
  },
};

/** Ink and content live on a page, in a layer: the checks the sync server will make. */
const onPage = (f: DocumentFacts) => ({ ...f, pageLocked: false, layerOwnerOnly: false });

describe("section 4 roles table", () => {
  for (const [source, { roles, make }] of Object.entries(SOURCES)) {
    describe(`role from ${source}`, () => {
      for (const role of roles) {
        for (const action of ["view", "comment", "edit", "managePages", "delete"] as const) {
          const expected = TABLE[role][action];
          it(`${role} ${expected ? "can" : "cannot"} ${action}`, () => {
            const decision = decideDocument(make(role), action);
            expect(decision.allowed).toBe(expected);
            if (!decision.allowed) expect(decision.reason).toBe("role_too_low");
          });
        }
        it(`${role} ${TABLE[role].edit ? "can" : "cannot"} edit ink on a page and its layers`, () => {
          const f = onPage(make(role));
          expect(decidePage(f, "edit").allowed).toBe(TABLE[role].edit);
          expect(decideLayer(f, "edit").allowed).toBe(TABLE[role].edit);
          expect(decidePage(f, "managePages").allowed).toBe(TABLE[role].managePages);
          expect(decidePage(f, "view").allowed).toBe(true);
        });
        it(`${role} share: ${String(SHARE[role].allowed)} / ${String(SHARE[role].ifAllowed)} when editors may share`, () => {
          expect(decideDocument(make(role), "share").allowed).toBe(SHARE[role].allowed);
          const withSwitch = { ...make(role), editorsCanShare: true };
          expect(decideDocument(withSwitch, "share").allowed).toBe(SHARE[role].ifAllowed);
        });
      }
    });
  }

  it("covers every document action", () => {
    for (const action of DOCUMENT_ACTIONS) {
      expect(() => decideDocument(facts({ workspaceRole: "owner" }), action)).not.toThrow();
    }
  });
});

describe("commenter tries to edit ink", () => {
  const commenters = {
    "workspace member": facts({ workspaceRole: "commenter" }),
    "invited by email": facts({ grants: [{ role: "commenter", expiresAt: null }] }),
    "signed in through a commenter link": facts({ link: link({ role: "commenter" }) }),
    "guest through a commenter link": facts({ isGuest: true, link: link({ role: "commenter" }) }),
  };

  for (const [who, f] of Object.entries(commenters)) {
    it(`is denied for a commenter ${who}`, () => {
      const denied = { allowed: false, reason: "role_too_low", role: "commenter" };
      expect(decideDocument(f, "edit")).toMatchObject(denied);
      expect(decidePage(onPage(f), "edit")).toMatchObject(denied);
      expect(decideLayer(onPage(f), "edit")).toMatchObject(denied);
      // They can still see the page and comment on it.
      expect(decidePage(onPage(f), "view").allowed).toBe(true);
      expect(decideDocument(f, "comment").allowed).toBe(true);
    });
  }

  it("explains why", () => {
    const decision = decideLayer(onPage(facts({ workspaceRole: "commenter" })), "edit");
    expect(decision).toMatchObject({ message: "Your role doesn't allow this." });
  });
});

describe("combining sources", () => {
  it("takes the highest of workspace role and grants", () => {
    const f = facts({ workspaceRole: "viewer", grants: [{ role: "editor", expiresAt: null }] });
    expect(decideDocument(f, "edit")).toMatchObject({ allowed: true, role: "editor" });
  });

  it("makes workspace owners owners of every document", () => {
    expect(decideDocument(facts({ workspaceRole: "owner" }), "delete").allowed).toBe(true);
  });

  it("denies people with no role at all", () => {
    expect(decideDocument(facts(), "view")).toMatchObject({ allowed: false, reason: "no_access" });
  });

  it("ignores expired grants and says so", () => {
    const f = facts({ grants: [{ role: "editor", expiresAt: past }] });
    expect(decideDocument(f, "view")).toMatchObject({ allowed: false, reason: "grant_expired" });
    const withRole = { ...f, workspaceRole: "viewer" as const };
    expect(decideDocument(withRole, "edit")).toMatchObject({
      reason: "role_too_low",
      role: "viewer",
    });
  });

  it("returns a human message with every denial", () => {
    const decision = decideDocument(facts(), "edit");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.message.length).toBeGreaterThan(5);
  });
});

describe("share links", () => {
  it("grants the link role to signed-in users without their own access", () => {
    const f = facts({ link: link({ role: "commenter" }) });
    expect(decideDocument(f, "comment")).toMatchObject({ allowed: true, role: "commenter" });
    expect(decideDocument(f, "edit")).toMatchObject({ allowed: false, reason: "role_too_low" });
  });

  it("never lowers a user's own role", () => {
    const f = facts({ workspaceRole: "editor", link: link({ role: "viewer" }) });
    expect(decideDocument(f, "edit").allowed).toBe(true);
  });

  it("keeps direct access when the link is broken", () => {
    const f = facts({ workspaceRole: "viewer", link: link({ revoked: true }) });
    expect(decideDocument(f, "view").allowed).toBe(true);
  });

  it.each([
    ["revoked", { revoked: true }, "link_revoked"],
    ["expired", { expiresAt: past }, "link_expired"],
    [
      "missing its password",
      { passwordRequired: true, passwordVerified: false },
      "link_password_required",
    ],
  ] as const)("denies a link that is %s, with the reason", (_label, overrides, reason) => {
    const f = facts({ link: link(overrides) });
    expect(decideDocument(f, "view")).toMatchObject({ allowed: false, reason });
  });

  it("accepts a link whose password was verified and that expires later", () => {
    const f = facts({
      link: link({ passwordRequired: true, passwordVerified: true, expiresAt: future }),
    });
    expect(decideDocument(f, "view").allowed).toBe(true);
  });

  it("honours the link download switch unless the user has their own access", () => {
    const noDownload = link({ allowDownload: false });
    expect(decideDocument(facts({ link: noDownload }), "download")).toMatchObject({
      allowed: false,
      reason: "download_not_allowed",
    });
    const member = facts({ workspaceRole: "viewer", link: noDownload });
    expect(decideDocument(member, "download").allowed).toBe(true);
  });

  it("never lets an editor link share or delete", () => {
    const f = facts({ link: link({ role: "editor" }), editorsCanShare: false });
    expect(decideDocument(f, "share")).toMatchObject({ reason: "sharing_not_allowed" });
    expect(decideDocument(f, "delete")).toMatchObject({ reason: "role_too_low" });
  });
});

describe("guests", () => {
  const guest = (l: Partial<LinkFacts> = {}, o: Partial<DocumentFacts> = {}) =>
    facts({ isGuest: true, link: link(l), ...o });

  it("get exactly the link role", () => {
    expect(decideDocument(guest({ role: "editor" }), "edit")).toMatchObject({ allowed: true });
    expect(decideDocument(guest({ role: "viewer" }), "comment").allowed).toBe(false);
  });

  it("have no access without a link, even with grants or a workspace role on the facts", () => {
    const f = facts({
      isGuest: true,
      workspaceRole: "owner",
      grants: [{ role: "owner", expiresAt: null }],
    });
    expect(decideDocument(f, "view")).toMatchObject({ allowed: false, reason: "no_access" });
  });

  it("are refused by links that require sign-in", () => {
    expect(decideDocument(guest({ requireSignIn: true }), "view")).toMatchObject({
      reason: "sign_in_required",
    });
    const signedIn = facts({ link: link({ requireSignIn: true }) });
    expect(decideDocument(signedIn, "view").allowed).toBe(true);
  });

  it("can never share or delete", () => {
    const f = guest({ role: "editor" }, { editorsCanShare: true });
    expect(decideDocument(f, "share")).toMatchObject({ reason: "guests_not_allowed" });
    expect(decideDocument(f, "delete")).toMatchObject({ reason: "guests_not_allowed" });
  });
});

describe("trash", () => {
  const trashed = (role: Role) => facts({ workspaceRole: role, deleted: true });

  it("lets only owners see, restore and purge a trashed document", () => {
    for (const action of ["view", "restore", "purge"] as const) {
      expect(decideDocument(trashed("owner"), action).allowed).toBe(true);
      expect(decideDocument(trashed("editor"), action)).toMatchObject({
        reason: "document_deleted",
      });
    }
  });

  it("blocks every other action on a trashed document, even for owners", () => {
    const others: DocumentAction[] = [
      "comment",
      "edit",
      "managePages",
      "share",
      "delete",
      "download",
    ];
    for (const action of others) {
      expect(decideDocument(trashed("owner"), action)).toMatchObject({
        reason: "document_deleted",
      });
    }
  });

  it("refuses restore and purge for documents not in the trash", () => {
    expect(decideDocument(facts({ workspaceRole: "owner" }), "purge")).toMatchObject({
      reason: "not_in_trash",
    });
  });

  it("does not let a share-link owner-equivalent purge (links cap at editor)", () => {
    const f = facts({ deleted: true, link: link({ role: "editor" }) });
    expect(decideDocument(f, "purge").allowed).toBe(false);
  });
});

describe("page locks", () => {
  const page = (role: Role, pageLocked: boolean) => ({
    ...facts({ workspaceRole: role }),
    pageLocked,
  });

  it("stop editors from changing a locked page, but not owners", () => {
    expect(decidePage(page("editor", true), "edit")).toMatchObject({ reason: "page_locked" });
    expect(decidePage(page("editor", true), "managePages")).toMatchObject({
      reason: "page_locked",
    });
    expect(decidePage(page("owner", true), "edit").allowed).toBe(true);
    expect(decidePage(page("editor", false), "edit").allowed).toBe(true);
  });

  it("still let everyone with access view a locked page", () => {
    expect(decidePage(page("viewer", true), "view").allowed).toBe(true);
  });

  it("let only owners lock or unlock pages", () => {
    expect(decidePage(page("owner", false), "lock").allowed).toBe(true);
    expect(decidePage(page("editor", false), "lock")).toMatchObject({ reason: "role_too_low" });
  });
});

describe("layer locks", () => {
  const layer = (role: Role, layerOwnerOnly: boolean, pageLocked = false) => ({
    ...facts({ workspaceRole: role }),
    pageLocked,
    layerOwnerOnly,
  });

  it("keep owner-only layers for owners", () => {
    expect(decideLayer(layer("editor", true), "edit")).toMatchObject({ reason: "layer_locked" });
    expect(decideLayer(layer("owner", true), "edit").allowed).toBe(true);
    expect(decideLayer(layer("editor", false), "edit").allowed).toBe(true);
  });

  it("respect the page lock first", () => {
    expect(decideLayer(layer("editor", false, true), "edit")).toMatchObject({
      reason: "page_locked",
    });
  });

  it("let viewers see locked layers", () => {
    expect(decideLayer(layer("viewer", true), "view").allowed).toBe(true);
  });
});

describe("workspaces and folders", () => {
  const ws = (memberRole: Role | null, personal = false) => ({
    isGuest: false,
    memberRole,
    personal,
    deleted: false,
  });

  it.each([
    ["owner", { view: true, createContent: true, rename: true, manageMembers: true, delete: true }],
    [
      "editor",
      { view: true, createContent: true, rename: false, manageMembers: false, delete: false },
    ],
    [
      "commenter",
      { view: true, createContent: false, rename: false, manageMembers: false, delete: false },
    ],
    [
      "viewer",
      { view: true, createContent: false, rename: false, manageMembers: false, delete: false },
    ],
  ] as const)("%s workspace permissions", (role, expected) => {
    for (const [action, allowed] of Object.entries(expected)) {
      expect(decideWorkspace(ws(role), action as keyof typeof expected).allowed, action).toBe(
        allowed,
      );
    }
  });

  it("keeps personal workspaces private and undeletable", () => {
    expect(decideWorkspace(ws("owner", true), "manageMembers")).toMatchObject({
      reason: "personal_workspace",
    });
    expect(decideWorkspace(ws("owner", true), "delete")).toMatchObject({
      reason: "personal_workspace",
    });
    expect(decideWorkspace(ws("owner", true), "rename").allowed).toBe(true);
  });

  it("refuses non-members, guests and deleted workspaces", () => {
    expect(decideWorkspace(ws(null), "view")).toMatchObject({ reason: "no_access" });
    expect(decideWorkspace({ ...ws("owner"), isGuest: true }, "view")).toMatchObject({
      reason: "guests_not_allowed",
    });
    expect(decideWorkspace({ ...ws("owner"), deleted: true }, "view")).toMatchObject({
      reason: "not_found",
    });
  });

  it("lets viewers see folders and editors change them", () => {
    expect(decideFolder(ws("viewer"), "view").allowed).toBe(true);
    expect(decideFolder(ws("viewer"), "edit")).toMatchObject({ reason: "role_too_low" });
    expect(decideFolder(ws("editor"), "delete").allowed).toBe(true);
  });
});

describe("smart folders", () => {
  const facts = (overrides: Partial<Parameters<typeof decideSmartFolder>[0]> = {}) => ({
    isGuest: false,
    memberRole: "viewer" as Role,
    personal: false,
    deleted: false,
    isOwner: true,
    ...overrides,
  });

  it("belong to the user who saved them while they can still see the workspace", () => {
    expect(decideSmartFolder(facts()).allowed).toBe(true);
    // To anyone else, even the workspace owner, it does not exist.
    expect(decideSmartFolder(facts({ isOwner: false, memberRole: "owner" }))).toMatchObject({
      reason: "not_found",
    });
    expect(decideSmartFolder(facts({ memberRole: null }))).toMatchObject({ reason: "no_access" });
    expect(decideSmartFolder(facts({ isGuest: true }))).toMatchObject({
      reason: "guests_not_allowed",
    });
    expect(decideSmartFolder(facts({ deleted: true }))).toMatchObject({ reason: "not_found" });
  });
});
