"use client";

import { EMPTY_FILTERS } from "@pc/schema";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { libraryApi } from "@/lib/library/api";
import { libraryKeys } from "@/lib/library/cache";
import { formatShortDate, TYPE_LABELS } from "@/lib/library/format";
import { cn } from "@/lib/utils";

import { DocumentTypeIcon } from "./document-thumb";
import { useActiveWorkspace } from "./library-context";

const DEBOUNCE_MS = 200;
const MIN_LENGTH = 2;

/**
 * Title search in the top bar (SPEC.md section 5): fuzzy (trigram) matches in the current
 * workspace as you type. Enter opens every result in the library; picking one selects it there.
 * "/" or cmd/ctrl+K jumps here from anywhere.
 */
export function LibrarySearch() {
  const workspace = useActiveWorkspace();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(text.trim());
      setActive(-1);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, [contenteditable=true]");
      if (
        (event.key === "k" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "/" && !typing)
      ) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const enabled = q.length >= MIN_LENGTH;
  const results = useQuery({
    queryKey: libraryKeys.search(workspace.id, q),
    queryFn: ({ signal }) =>
      libraryApi.page(
        {
          scope: { kind: "search", workspaceId: workspace.id, q },
          sort: "relevance",
          dir: "desc",
          filters: EMPTY_FILTERS,
          cursor: null,
          limit: 8,
        },
        signal,
      ),
    enabled,
    staleTime: 30_000,
  });
  const items = enabled ? (results.data?.items ?? []) : [];
  const showList = open && enabled;

  const go = (selectId: string | null) => {
    const params = new URLSearchParams({ q: text.trim() });
    if (selectId) params.set("select", selectId);
    setOpen(false);
    inputRef.current?.blur();
    router.push(`/app/search?${params.toString()}`);
  };

  return (
    <div className="relative w-full max-w-md">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label={`Search titles in ${workspace.name}`}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${String(active)}` : undefined}
        data-testid="library-search"
        placeholder="Search titles"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          // Let a click on a result land first.
          setTimeout(() => {
            setOpen(false);
          }, 150);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && items.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActive((i) => (i + 1) % items.length);
          } else if (event.key === "ArrowUp" && items.length > 0) {
            event.preventDefault();
            setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
          } else if (event.key === "Enter" && text.trim().length > 0) {
            event.preventDefault();
            go(items[active]?.id ?? null);
          } else if (event.key === "Escape") {
            if (text) setText("");
            else inputRef.current?.blur();
            setOpen(false);
          }
        }}
        className="h-9 w-full min-w-0 rounded-lg border bg-card pr-8 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 font-mono text-[0.6875rem] text-muted-foreground md:block">
        /
      </kbd>
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching titles"
          data-testid="search-results"
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border bg-popover p-1 shadow-popover"
        >
          {results.isFetching && items.length === 0 ? (
            <li
              role="presentation"
              className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground"
            >
              <Loader2 aria-hidden className="size-4 animate-spin" /> Searching
            </li>
          ) : null}
          {!results.isFetching && items.length === 0 ? (
            <li role="presentation" className="px-2 py-2 text-sm text-muted-foreground">
              No titles match “{q}”
            </li>
          ) : null}
          {items.map((item, index) => (
            <li
              key={item.id}
              id={`${listId}-${String(index)}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                go(item.id);
              }}
              onMouseEnter={() => {
                setActive(index);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                index === active && "bg-accent text-accent-foreground",
              )}
            >
              <DocumentTypeIcon type={item.type} className="text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {TYPE_LABELS[item.type]} · {formatShortDate(item.updatedAt)}
              </span>
            </li>
          ))}
          {items.length > 0 ? (
            <li
              role="presentation"
              className="border-t px-2 pt-1.5 pb-1 text-xs text-muted-foreground"
            >
              Enter shows all results
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
