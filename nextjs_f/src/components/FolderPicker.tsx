"use client";

import type { FolderRecord } from "@/lib/folderStore";

interface FolderPickerProps {
  folders: FolderRecord[];
  activeFolderId: string | null;
  onSelect: (record: FolderRecord) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  busy?: boolean;
  variant?: "full" | "dropdown";
}

export function FolderPicker({
  folders,
  activeFolderId,
  onSelect,
  onAdd,
  onRemove,
  busy = false,
  variant = "full",
}: FolderPickerProps) {
  const isDropdown = variant === "dropdown";

  return (
    <div className={isDropdown ? "w-72 p-1" : "w-full max-w-sm"}>
      {folders.length > 0 && (
        <ul className={isDropdown ? "mb-1 max-h-64 overflow-y-auto" : "mb-4 text-left"}>
          {folders.map((folder) => {
            const isActive = folder.id === activeFolderId;
            return (
              <li key={folder.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(folder)}
                  disabled={busy}
                  className={`flex-1 truncate rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10 ${
                    isActive ? "bg-black/10 font-medium dark:bg-white/15" : ""
                  }`}
                  translate="no"
                  title={folder.name}
                >
                  {folder.name}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(folder.id)}
                  disabled={busy}
                  aria-label={`${folder.name}を一覧から削除`}
                  title="一覧から削除"
                  className="shrink-0 rounded px-2 py-1.5 text-base leading-none text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-neutral-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={onAdd}
        disabled={busy}
        className={
          isDropdown
            ? `w-full rounded px-2 py-1.5 text-left text-sm text-neutral-600 hover:bg-black/5 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-white/10 ${
                folders.length > 0
                  ? "border-t border-neutral-200 pt-2 dark:border-neutral-700"
                  : ""
              }`
            : "rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        }
      >
        {busy ? "読み込み中..." : "＋ 新しいフォルダを追加"}
      </button>
    </div>
  );
}
