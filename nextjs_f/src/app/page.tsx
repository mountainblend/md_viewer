"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileTree } from "@/components/FileTree";
import { FolderPicker } from "@/components/FolderPicker";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { SearchPanel } from "@/components/SearchPanel";
import {
  isFileSystemAccessSupported,
  pickFolder,
  verifyPermission,
  walkMarkdownFiles,
  type FileEntry,
} from "@/lib/fsAccess";
import {
  addFolder,
  getActiveFolderId,
  listFolders,
  removeFolder,
  setActiveFolderId as persistActiveFolderId,
  touchFolder,
  type FolderRecord,
} from "@/lib/folderStore";
import { buildContentCache } from "@/lib/searchIndex";
import { useTheme } from "@/lib/theme";
import { usePersistedState } from "@/lib/usePersistedState";

type Status = "checking" | "unsupported" | "no-folder" | "loading" | "ready";

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 256;

export default function Home() {
  const [status, setStatus] = useState<Status>("checking");
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(
    null
  );
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [isDark, toggleTheme] = useTheme();
  const [sidebarWidth, setSidebarWidth] = usePersistedState(
    "sidebarWidth",
    SIDEBAR_DEFAULT_WIDTH
  );
  const [sidebarHidden, setSidebarHidden] = usePersistedState(
    "sidebarHidden",
    false
  );
  const draggingRef = useRef(false);

  const [contentCache, setContentCache] = useState<Map<string, string>>(
    new Map()
  );
  const [indexing, setIndexing] = useState(false);
  const contentCacheRef = useRef<Map<string, string>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      setContentCache(new Map(contentCacheRef.current));
    }, 150);
  }, []);

  const handleContentLoaded = useCallback(
    (path: string, content: string) => {
      contentCacheRef.current.set(path, content);
      scheduleFlush();
    },
    [scheduleFlush]
  );

  const loadFolder = useCallback(async (record: FolderRecord) => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const files = await walkMarkdownFiles(record.handle);
      files.sort((a, b) => a.path.localeCompare(b.path, "ja"));
      setRootHandle(record.handle);
      setActiveFolderId(record.id);
      setEntries(files);
      setSelectedPath(null);
      setStatus("ready");
    } catch {
      setErrorMessage("フォルダの読み込みに失敗しました。");
      setStatus("no-folder");
    }
  }, []);

  // 初回マウント時: 保存済みフォルダ一覧から、直近使用したフォルダをサイレントに読み込む
  useEffect(() => {
    (async () => {
      if (!isFileSystemAccessSupported()) {
        setStatus("unsupported");
        return;
      }

      const list = await listFolders();
      setFolders(list);

      if (list.length === 0) {
        setStatus("no-folder");
        return;
      }

      const savedActiveId = await getActiveFolderId();
      const activeRecord =
        list.find((f) => f.id === savedActiveId) ?? list[0];

      if (await verifyPermission(activeRecord.handle, false)) {
        await loadFolder(activeRecord);
      } else {
        setStatus("no-folder");
      }
    })();
  }, [loadFolder]);

  // entries（表示中フォルダのファイル一覧）が変わるたびに、検索用の本文キャッシュをバックグラウンド作成する
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      contentCacheRef.current = new Map();
      setContentCache(new Map());

      if (entries.length === 0) {
        setIndexing(false);
        return;
      }

      setIndexing(true);
      await buildContentCache(entries, handleContentLoaded, controller.signal);
      if (!controller.signal.aborted) {
        setContentCache(new Map(contentCacheRef.current));
        setIndexing(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [entries, handleContentLoaded]);

  // フォルダ切り替えドロップダウンの外側クリックで閉じる
  useEffect(() => {
    if (!pickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  const refreshFolderList = useCallback(async () => {
    setFolders(await listFolders());
  }, []);

  const handleSelectFolder = async (record: FolderRecord) => {
    setPickerOpen(false);
    setPickerBusy(true);
    setErrorMessage(null);
    try {
      const granted = await verifyPermission(record.handle, true);
      if (!granted) {
        setErrorMessage("フォルダへのアクセスが許可されませんでした。");
        return;
      }
      await touchFolder(record.id);
      await persistActiveFolderId(record.id);
      await loadFolder(record);
      await refreshFolderList();
    } finally {
      setPickerBusy(false);
    }
  };

  const handleAddFolder = async () => {
    setPickerBusy(true);
    setErrorMessage(null);
    try {
      const handle = await pickFolder();
      const granted = await verifyPermission(handle, true);
      if (!granted) {
        setErrorMessage("フォルダへのアクセスが許可されませんでした。");
        return;
      }
      const record = await addFolder(handle);
      setPickerOpen(false);
      await loadFolder(record);
      await refreshFolderList();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setErrorMessage("フォルダの選択に失敗しました。");
    } finally {
      setPickerBusy(false);
    }
  };

  const handleRemoveFolder = async (id: string) => {
    await removeFolder(id);
    await refreshFolderList();
    if (id === activeFolderId) {
      setRootHandle(null);
      setEntries([]);
      setSelectedPath(null);
      setActiveFolderId(null);
      setStatus("no-folder");
    }
  };

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const next = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, e.clientX)
    );
    setSidebarWidth(next);
  };
  const handleDragEnd = () => {
    draggingRef.current = false;
  };

  if (status === "checking") {
    return <CenteredMessage>読み込み中...</CenteredMessage>;
  }

  if (status === "unsupported") {
    return (
      <CenteredMessage>
        <p>このブラウザは File System Access API に対応していません。</p>
        <p className="mt-1">
          Google Chrome または Microsoft Edge の最新版でお試しください。
        </p>
      </CenteredMessage>
    );
  }

  if (status === "no-folder" || status === "loading" || !rootHandle) {
    return (
      <CenteredMessage>
        <p className="mb-4">閲覧したいフォルダを選択してください。</p>
        <FolderPicker
          folders={folders}
          activeFolderId={activeFolderId}
          onSelect={handleSelectFolder}
          onAdd={handleAddFolder}
          onRemove={handleRemoveFolder}
          busy={pickerBusy || status === "loading"}
          variant="full"
        />
        {errorMessage && (
          <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
        )}
        <p className="mt-4 max-w-sm text-xs text-neutral-400">
          選択したフォルダの内容は編集内容も含めこの端末のブラウザ内だけで処理され、サーバーには送信されません。
        </p>
      </CenteredMessage>
    );
  }

  const selectedEntry = entries.find((e) => e.path === selectedPath) ?? null;

  return (
    <div className="flex h-screen">
      {!sidebarHidden && (
        <>
          <aside
            className="flex shrink-0 flex-col border-r border-neutral-200 p-2 dark:border-neutral-800"
            style={{ width: sidebarWidth }}
          >
            <div className="mb-2 flex items-center justify-between px-1 py-1">
              <div className="relative min-w-0" ref={pickerRef}>
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="truncate rounded px-1 py-0.5 text-xs font-semibold text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
                  translate="no"
                  title={rootHandle.name}
                >
                  {rootHandle.name} ▾
                </button>
                {pickerOpen && (
                  <div className="absolute left-0 top-full z-10 mt-1 rounded border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                    <FolderPicker
                      folders={folders}
                      activeFolderId={activeFolderId}
                      onSelect={handleSelectFolder}
                      onAdd={handleAddFolder}
                      onRemove={handleRemoveFolder}
                      busy={pickerBusy}
                      variant="dropdown"
                    />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label="ダークモード切り替え"
                  className="rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {isDark ? "☀️" : "🌙"}
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarHidden(true)}
                  aria-label="サイドバーを隠す"
                  className="rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  «
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <SearchPanel
                entries={entries}
                contentCache={contentCache}
                indexing={indexing}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
                treeFallback={
                  <FileTree
                    entries={entries}
                    selectedPath={selectedPath}
                    onSelect={setSelectedPath}
                  />
                }
              />
            </div>
          </aside>
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-neutral-300 dark:hover:bg-neutral-700"
          />
        </>
      )}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {sidebarHidden && (
          <button
            type="button"
            onClick={() => setSidebarHidden(false)}
            aria-label="サイドバーを表示"
            className="absolute left-2 top-2 z-10 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
          >
            »
          </button>
        )}
        {selectedEntry ? (
          <MarkdownEditor
            rootHandle={rootHandle}
            entry={selectedEntry}
            onContentLoaded={handleContentLoaded}
          />
        ) : (
          <CenteredMessage>
            左のファイル一覧から表示したいノートを選んでください。
          </CenteredMessage>
        )}
      </main>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center px-6 text-center text-sm text-neutral-600 dark:text-neutral-300">
      {children}
    </div>
  );
}
