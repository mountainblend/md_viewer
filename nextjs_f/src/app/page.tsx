"use client";

import { useCallback, useEffect, useState } from "react";
import { FileTree } from "@/components/FileTree";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import {
  isFileSystemAccessSupported,
  pickVaultDirectory,
  verifyPermission,
  walkMarkdownFiles,
  type VaultFileEntry,
} from "@/lib/fsAccess";
import { loadVaultHandle, saveVaultHandle } from "@/lib/vaultHandleStore";

type Status = "checking" | "unsupported" | "no-vault" | "loading" | "ready";

export default function Home() {
  const [status, setStatus] = useState<Status>("checking");
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(
    null
  );
  const [entries, setEntries] = useState<VaultFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadVault = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const files = await walkMarkdownFiles(handle);
      files.sort((a, b) => a.path.localeCompare(b.path, "ja"));
      setRootHandle(handle);
      setEntries(files);
      setSelectedPath(null);
      setStatus("ready");
    } catch {
      setErrorMessage("Vaultの読み込みに失敗しました。");
      setStatus("no-vault");
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!isFileSystemAccessSupported()) {
        setStatus("unsupported");
        return;
      }

      const savedHandle = await loadVaultHandle();
      if (savedHandle && (await verifyPermission(savedHandle, false))) {
        await loadVault(savedHandle);
      } else {
        setStatus("no-vault");
      }
    })();
  }, [loadVault]);

  const handlePick = async () => {
    try {
      const handle = await pickVaultDirectory();
      const granted = await verifyPermission(handle, true);
      if (!granted) {
        setErrorMessage("フォルダへのアクセスが許可されませんでした。");
        return;
      }
      await saveVaultHandle(handle);
      await loadVault(handle);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setErrorMessage("フォルダの選択に失敗しました。");
    }
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

  if (status === "no-vault" || status === "loading" || !rootHandle) {
    return (
      <CenteredMessage>
        <p className="mb-4">閲覧したいVault（フォルダ）を選択してください。</p>
        <button
          type="button"
          onClick={handlePick}
          disabled={status === "loading"}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {status === "loading" ? "読み込み中..." : "フォルダを選択"}
        </button>
        {errorMessage && (
          <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
        )}
        <p className="mt-4 max-w-sm text-xs text-neutral-400">
          選択したフォルダの内容はこの端末のブラウザ内だけで処理され、サーバーには送信されません。
        </p>
      </CenteredMessage>
    );
  }

  const selectedEntry = entries.find((e) => e.path === selectedPath) ?? null;

  return (
    <div className="flex h-screen">
      <aside className="w-64 shrink-0 overflow-y-auto border-r border-neutral-200 p-2 dark:border-neutral-800">
        <div className="mb-2 flex items-center justify-between px-2 py-1">
          <span
            className="truncate text-xs font-semibold text-neutral-500"
            translate="no"
            title={rootHandle.name}
          >
            {rootHandle.name}
          </span>
          <button
            type="button"
            onClick={handlePick}
            className="shrink-0 text-xs text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            変更
          </button>
        </div>
        <FileTree
          entries={entries}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
        />
      </aside>
      <main className="flex-1 overflow-y-auto">
        {selectedEntry ? (
          <MarkdownViewer rootHandle={rootHandle} entry={selectedEntry} />
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
