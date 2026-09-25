/**
 * Geometry of the virtualized library views. Everything is arithmetic (no DOM measuring), so the
 * virtualizer, keyboard navigation and box selection agree on where each item is, even for the
 * thousands of items that are not rendered.
 */

export const GRID_GAP = 20;
export const GRID_MIN_CARD = 184;
/** Phones get smaller cards so two fit side by side. */
export const GRID_MIN_CARD_NARROW = 140;
const NARROW = 520;
/** Thumbnail is 4:3; below it, title and one line of details. */
export const CARD_TEXT_HEIGHT = 60;
export const LIST_ROW_HEIGHT = 48;
export const LIST_HEADER_HEIGHT = 40;

export interface GridLayout {
  kind: "grid";
  columns: number;
  cardWidth: number;
  cardHeight: number;
  /** Card height plus the gap below it. */
  rowHeight: number;
  gap: number;
}

export interface ListLayout {
  kind: "list";
  rowHeight: number;
  headerHeight: number;
}

export type Layout = GridLayout | ListLayout;

export function gridLayout(width: number): GridLayout {
  const min = width < NARROW ? GRID_MIN_CARD_NARROW : GRID_MIN_CARD;
  const usable = Math.max(width, min);
  const columns = Math.max(1, Math.floor((usable + GRID_GAP) / (min + GRID_GAP)));
  const cardWidth = (usable - GRID_GAP * (columns - 1)) / columns;
  const cardHeight = Math.round((cardWidth * 3) / 4) + CARD_TEXT_HEIGHT;
  return {
    kind: "grid",
    columns,
    cardWidth,
    cardHeight,
    rowHeight: cardHeight + GRID_GAP,
    gap: GRID_GAP,
  };
}

export const listLayout: ListLayout = {
  kind: "list",
  rowHeight: LIST_ROW_HEIGHT,
  headerHeight: LIST_HEADER_HEIGHT,
};

export const columnsOf = (layout: Layout) => (layout.kind === "grid" ? layout.columns : 1);

export function rowCount(layout: Layout, items: number): number {
  return Math.ceil(items / columnsOf(layout));
}

export type NavKey =
  "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End" | "PageUp" | "PageDown";

export const NAV_KEYS: readonly string[] = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
];

/** The index a navigation key moves to from `index` (clamped to the items). */
export function navigate(
  key: NavKey,
  index: number,
  count: number,
  columns: number,
  rowsPerPage: number,
): number {
  if (count === 0) return -1;
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));
  if (index < 0) return key === "End" ? count - 1 : 0;
  switch (key) {
    case "ArrowLeft":
      return clamp(index - 1);
    case "ArrowRight":
      return clamp(index + 1);
    case "ArrowUp":
      return index - columns >= 0 ? index - columns : index;
    case "ArrowDown": {
      if (index + columns < count) return index + columns;
      // Above a short last row, down lands on the last item instead of doing nothing.
      const row = Math.floor(index / columns);
      const lastRow = Math.floor((count - 1) / columns);
      return row < lastRow ? count - 1 : index;
    }
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "PageUp":
      return clamp(index - columns * Math.max(1, rowsPerPage));
    case "PageDown":
      return clamp(index + columns * Math.max(1, rowsPerPage));
  }
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function normaliseRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

/**
 * Indexes of the items a selection box touches. The box is in content coordinates: (0, 0) is the
 * top-left of the first item (below the list header).
 */
export function itemsInRect(rect: Rect, layout: Layout, width: number, count: number): number[] {
  if (count === 0 || rect.bottom < 0 || rect.right < 0 || rect.left > width) return [];
  const hits: number[] = [];
  if (layout.kind === "list") {
    const first = Math.max(0, Math.floor(rect.top / layout.rowHeight));
    const last = Math.min(count - 1, Math.floor(rect.bottom / layout.rowHeight));
    for (let i = first; i <= last; i++) hits.push(i);
    return hits;
  }
  const { columns, cardWidth, cardHeight, rowHeight, gap } = layout;
  const firstRow = Math.max(0, Math.floor(rect.top / rowHeight));
  const lastRow = Math.min(rowCount(layout, count) - 1, Math.floor(rect.bottom / rowHeight));
  for (let row = firstRow; row <= lastRow; row++) {
    const top = row * rowHeight;
    if (rect.bottom < top || rect.top > top + cardHeight) continue;
    for (let col = 0; col < columns; col++) {
      const index = row * columns + col;
      if (index >= count) break;
      const left = col * (cardWidth + gap);
      if (rect.right >= left && rect.left <= left + cardWidth) hits.push(index);
    }
  }
  return hits;
}
