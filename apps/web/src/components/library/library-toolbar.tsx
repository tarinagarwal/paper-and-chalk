"use client";

import {
  activeFilterCount,
  DEFAULT_SORT_DIR,
  DOCUMENT_TYPES,
  EMPTY_FILTERS,
  FIXED_DIRECTION_SORTS,
  sortsFor,
  type LibraryFilters,
  type LibraryScopeKind,
  type LibraryView,
  type TagView,
} from "@pc/schema";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  ArrowUpDown,
  LayoutGrid,
  List,
  ListFilter,
  Plus,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ViewMode } from "@/lib/library/constants";
import { SORT_LABELS, TYPE_LABELS } from "@/lib/library/format";

const OWNER_LABELS = { anyone: "Anyone", me: "Me", others: "Others" } as const;
const SHARED_LABELS = { any: "Any", shared: "Shared", private: "Not shared" } as const;

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 eyebrow text-muted-foreground">{label}</legend>
      {children}
    </fieldset>
  );
}

function CheckRow({
  id,
  label,
  checked,
  onChange,
  swatch,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  swatch?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => {
          onChange(value === true);
        }}
      />
      {swatch ? (
        <span aria-hidden className="size-2 rounded-full" style={{ background: swatch }} />
      ) : null}
      {label}
    </label>
  );
}

function FiltersPopover({
  filters,
  onChange,
  tags,
  showOwner,
}: {
  filters: LibraryFilters;
  onChange: (filters: LibraryFilters) => void;
  tags: TagView[];
  showOwner: boolean;
}) {
  const count = activeFilterCount(filters);
  const toggle = <T,>(list: readonly T[], value: T, on: boolean) =>
    on ? [...list, value] : list.filter((v) => v !== value);
  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid="filters-button">
          <ListFilter aria-hidden />
          Filters
          {count > 0 ? (
            <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[0.6875rem] leading-4 text-primary-foreground">
              {count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-72 flex-col gap-5"
        data-testid="filters-panel"
      >
        <FilterGroup label="Type">
          {DOCUMENT_TYPES.map((type) => (
            <CheckRow
              key={type}
              id={`filter-type-${type}`}
              label={TYPE_LABELS[type]}
              checked={filters.types.includes(type)}
              onChange={(on) => {
                onChange({ ...filters, types: toggle(filters.types, type, on) });
              }}
            />
          ))}
        </FilterGroup>
        {showOwner ? (
          <FilterGroup label="Owner">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={filters.owner}
              onValueChange={(value) => {
                if (value) onChange({ ...filters, owner: value as LibraryFilters["owner"] });
              }}
            >
              {(Object.keys(OWNER_LABELS) as LibraryFilters["owner"][]).map((owner) => (
                <ToggleGroupItem key={owner} value={owner}>
                  {OWNER_LABELS[owner]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FilterGroup>
        ) : null}
        {tags.length > 0 ? (
          <FilterGroup label="Tags">
            <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
              {tags.map((tag) => (
                <CheckRow
                  key={tag.id}
                  id={`filter-tag-${tag.id}`}
                  label={tag.name}
                  swatch={tag.color}
                  checked={filters.tagIds.includes(tag.id)}
                  onChange={(on) => {
                    onChange({ ...filters, tagIds: toggle(filters.tagIds, tag.id, on) });
                  }}
                />
              ))}
            </div>
          </FilterGroup>
        ) : null}
        <FilterGroup label="Sharing">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={filters.shared}
            onValueChange={(value) => {
              if (value) onChange({ ...filters, shared: value as LibraryFilters["shared"] });
            }}
          >
            {(Object.keys(SHARED_LABELS) as LibraryFilters["shared"][]).map((shared) => (
              <ToggleGroupItem key={shared} value={shared}>
                {SHARED_LABELS[shared]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FilterGroup>
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={count === 0}
          onClick={() => {
            onChange(EMPTY_FILTERS);
          }}
        >
          Clear filters
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Sort, filters, grid or list, save as smart folder, and New (SPEC.md section 5). */
export function LibraryToolbar({
  kind,
  view,
  onViewChange,
  tags,
  viewMode,
  onViewModeChange,
  onNew,
  onSaveSmartFolder,
}: {
  kind: LibraryScopeKind;
  view: LibraryView;
  onViewChange: (view: LibraryView) => void;
  tags: TagView[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNew: (() => void) | null;
  onSaveSmartFolder: (() => void) | null;
}) {
  const fixedDirection = FIXED_DIRECTION_SORTS.includes(view.sort);
  const DirIcon = view.dir === "asc" ? ArrowUpNarrowWide : ArrowDownNarrowWide;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="sort-button">
            <ArrowUpDown aria-hidden />
            <span className="sr-only">Sort by </span>
            {SORT_LABELS[view.sort]}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={view.sort}
            onValueChange={(value) => {
              const sort = sortsFor(kind).find((s) => s === value);
              if (sort) onViewChange({ ...view, sort, dir: DEFAULT_SORT_DIR[sort] });
            }}
          >
            {sortsFor(kind).map((sort) => (
              <DropdownMenuRadioItem key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {fixedDirection ? null : (
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={
            view.dir === "asc"
              ? "Ascending, switch to descending"
              : "Descending, switch to ascending"
          }
          data-testid="sort-direction"
          onClick={() => {
            onViewChange({ ...view, dir: view.dir === "asc" ? "desc" : "asc" });
          }}
        >
          <DirIcon aria-hidden />
        </Button>
      )}
      <FiltersPopover
        filters={view.filters}
        onChange={(filters) => {
          onViewChange({ ...view, filters });
        }}
        tags={tags}
        showOwner={kind !== "shared"}
      />
      {onSaveSmartFolder && activeFilterCount(view.filters) > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSaveSmartFolder}
          data-testid="save-smart-folder"
        >
          <Sparkles aria-hidden />
          Save as smart folder
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="View"
          value={viewMode}
          onValueChange={(value) => {
            if (value === "grid" || value === "list") onViewModeChange(value);
          }}
        >
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGrid aria-hidden />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <List aria-hidden />
          </ToggleGroupItem>
        </ToggleGroup>
        {onNew ? (
          <Button size="sm" onClick={onNew} data-testid="new-document">
            <Plus aria-hidden />
            New
          </Button>
        ) : null}
      </div>
    </div>
  );
}
