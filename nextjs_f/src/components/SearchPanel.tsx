"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { FileEntry } from "@/lib/fsAccess";
import { searchEntries } from "@/lib/searchIndex";

interface SearchPanelProps {
  entries: FileEntry[];
  contentCache: Map<string, string>;
  indexing: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  treeFallback: ReactNode;
}

function highlightSnippet(snippet: string, query: string): ReactNode {
  const idx = snippet.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1 || !query) return snippet;
  return (
    <>
      {snippet.slice(0, idx)}
      <mark className="bg-yellow-200 text-inherit dark:bg-yellow-600/60">
        {snippet.slice(idx, idx + query.length)}
      </mark>
      {snippet.slice(idx + query.length)}
    </>
  );
}

export function SearchPanel({
  entries,
  contentCache,
  indexing,
  selectedPath,
  onSelect,
  treeFallback,
}: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const trimmedQuery = debouncedQuery.trim();
  const results = trimmedQuery
    ? searchEntries(entries, contentCache, trimmedQuery)
    : [];

  return (
    <div className="flex h-full flex-col">
      <div className="px-1 pb-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ファイル名・本文を検索"
          className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
        />
        {indexing && (
          <p className="mt-1 px-1 text-[11px] text-neutral-400">
            本文を検索用に読み込み中…
          </p>
        )}
      </div>

      {trimmedQuery ? (
        <ul className="min-h-0 flex-1 overflow-y-auto text-sm">
          {results.length === 0 && (
            <li className="px-2 py-1 text-neutral-400">
              一致するファイルが見つかりません。
            </li>
          )}
          {results.map((result) => {
            const isSelected = result.entry.path === selectedPath;
            return (
              <li key={result.entry.path}>
                <button
                  type="button"
                  onClick={() => onSelect(result.entry.path)}
                  className={`block w-full rounded px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 ${
                    isSelected ? "bg-black/10 dark:bg-white/15" : ""
                  }`}
                >
                  <div className="truncate font-medium" translate="no">
                    {result.entry.path}
                  </div>
                  {result.snippet && (
                    <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {highlightSnippet(result.snippet, trimmedQuery)}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">{treeFallback}</div>
      )}
    </div>
  );
}
