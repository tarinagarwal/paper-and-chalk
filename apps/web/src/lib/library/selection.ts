/**
 * Library selection, like a desktop file manager: click selects one, cmd/ctrl-click toggles,
 * shift-click selects the range from the anchor, arrows move the focus (shift extends), and a box
 * drawn on the background selects what it touches. Pure functions over the ids in view order.
 */

export interface Selection {
  ids: ReadonlySet<string>;
  /** Where shift ranges start. */
  anchor: string | null;
  /** The item with keyboard focus. */
  focus: string | null;
}

export const EMPTY_SELECTION: Selection = { ids: new Set(), anchor: null, focus: null };

export interface Modifiers {
  shift?: boolean;
  /** cmd on macOS, ctrl elsewhere. */
  toggle?: boolean;
}

function range(order: readonly string[], from: string, to: string): string[] {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** A click (or tap) on an item. */
export function clickItem(
  selection: Selection,
  id: string,
  modifiers: Modifiers,
  order: readonly string[],
): Selection {
  if (modifiers.shift && selection.anchor) {
    const span = range(order, selection.anchor, id);
    const ids = new Set(modifiers.toggle ? [...selection.ids, ...span] : span);
    return { ids, anchor: selection.anchor, focus: id };
  }
  if (modifiers.toggle) {
    const ids = new Set(selection.ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    return { ids, anchor: id, focus: id };
  }
  return { ids: new Set([id]), anchor: id, focus: id };
}

/** Moves the keyboard focus; with shift the selection follows as a range from the anchor. */
export function moveFocus(
  selection: Selection,
  target: string,
  modifiers: Modifiers,
  order: readonly string[],
): Selection {
  if (modifiers.shift) {
    const anchor = selection.anchor ?? selection.focus ?? target;
    return { ids: new Set(range(order, anchor, target)), anchor, focus: target };
  }
  if (modifiers.toggle) return { ...selection, focus: target };
  return { ids: new Set([target]), anchor: target, focus: target };
}

export function selectAll(order: readonly string[], focus: string | null): Selection {
  return { ids: new Set(order), anchor: order[0] ?? null, focus: focus ?? order[0] ?? null };
}

/** Space: toggles the focused item in or out of the selection. */
export function toggleFocused(selection: Selection): Selection {
  if (!selection.focus) return selection;
  return clickItem(selection, selection.focus, { toggle: true }, []);
}

/** A box drag: what it touches, added to what was selected before when toggling. */
export function boxSelect(
  before: Selection,
  hits: readonly string[],
  additive: boolean,
): Selection {
  const ids = new Set(additive ? [...before.ids, ...hits] : hits);
  const last = hits.at(-1) ?? before.focus;
  return { ids, anchor: hits[0] ?? before.anchor, focus: last };
}

/** Drops ids that are no longer in view (after a filter change, delete or move). */
export function pruneSelection(selection: Selection, order: readonly string[]): Selection {
  const present = new Set(order);
  const ids = new Set([...selection.ids].filter((id) => present.has(id)));
  const keep = (id: string | null) => (id && present.has(id) ? id : null);
  if (ids.size === selection.ids.size && keep(selection.focus) === selection.focus) {
    return selection;
  }
  return { ids, anchor: keep(selection.anchor), focus: keep(selection.focus) };
}

/** What an action applies to: the selection when the item is in it, otherwise just the item. */
export function targetsFor(selection: Selection, id: string): string[] {
  return selection.ids.has(id) ? [...selection.ids] : [id];
}
