"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { resolveRelativePath, type FileEntry } from "@/lib/fsAccess";
import { usePersistedState } from "@/lib/usePersistedState";

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

const EDITOR_RATIO_MIN = 0.2;
const EDITOR_RATIO_MAX = 0.8;

type ViewMode = "edit" | "both" | "preview";

function stripFrontmatter(text: string): string {
  return text.replace(FRONTMATTER_PATTERN, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface MarkdownEditorProps {
  rootHandle: FileSystemDirectoryHandle;
  entry: FileEntry;
  onContentLoaded?: (path: string, content: string) => void;
}

export function MarkdownEditor({
  rootHandle,
  entry,
  onContentLoaded,
}: MarkdownEditorProps) {
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [viewMode, setViewMode] = usePersistedState<ViewMode>(
    "viewMode",
    "both"
  );
  const [isSwapped, setIsSwapped] = usePersistedState("paneSwapped", false);
  const [isScrollSynced, setIsScrollSynced] = usePersistedState(
    "scrollSync",
    true
  );
  const [editorRatio, setEditorRatio] = usePersistedState(
    "editorRatio",
    0.5
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isSyncScrollingRef = useRef(false);
  const draggingRatioRef = useRef(false);

  // entry（表示中のファイル）が変わったら、前のファイルの内容を表示し続けないようリセットする
  // (レンダー中にstateを調整するReact推奨パターン: https://react.dev/learn/you-might-not-need-an-effect)
  const [prevEntry, setPrevEntry] = useState(entry);
  if (entry !== prevEntry) {
    setPrevEntry(entry);
    setSavedContent(null);
    setEditedContent("");
    setLoadError(null);
    setSaveError(null);
  }

  const onContentLoadedRef = useRef(onContentLoaded);
  useEffect(() => {
    onContentLoadedRef.current = onContentLoaded;
  }, [onContentLoaded]);

  useEffect(() => {
    let cancelled = false;

    entry.handle
      .getFile()
      .then((file) => file.text())
      .then((text) => {
        if (!cancelled) {
          setSavedContent(text);
          setEditedContent(text);
          onContentLoadedRef.current?.(entry.path, text);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("ファイルの読み込みに失敗しました。");
      });

    return () => {
      cancelled = true;
    };
  }, [entry]);

  const hasUnsavedChanges =
    savedContent !== null && editedContent !== savedContent;

  const previewSource = useMemo(
    () => stripFrontmatter(editedContent),
    [editedContent]
  );

  const components = useMemo<Components>(
    () => ({
      img: ({ src, alt }) => (
        <ResolvedImage
          rootHandle={rootHandle}
          basePath={entry.path}
          src={typeof src === "string" ? src : ""}
          alt={alt}
        />
      ),
    }),
    [rootHandle, entry.path]
  );

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const writable = await entry.handle.createWritable();
      await writable.write(editedContent);
      await writable.close();
      setSavedContent(editedContent);
      onContentLoadedRef.current?.(entry.path, editedContent);
    } catch {
      setSaveError("保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const syncScroll = (source: HTMLElement, target: HTMLElement | null) => {
    if (!isScrollSynced || isSyncScrollingRef.current || !target) return;
    const sourceRange = source.scrollHeight - source.clientHeight;
    const ratio = sourceRange <= 0 ? 0 : source.scrollTop / sourceRange;
    const targetRange = target.scrollHeight - target.clientHeight;
    isSyncScrollingRef.current = true;
    target.scrollTop = ratio * targetRange;
    requestAnimationFrame(() => {
      isSyncScrollingRef.current = false;
    });
  };

  const handleEditorScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    syncScroll(e.currentTarget, previewRef.current);
  };
  const handlePreviewScroll = (e: React.UIEvent<HTMLDivElement>) => {
    syncScroll(e.currentTarget, textareaRef.current);
  };

  const handleRatioDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRatioRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleRatioDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRatioRef.current) return;
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const rawRatio = (e.clientX - rect.left) / rect.width;
    const ratio = isSwapped ? 1 - rawRatio : rawRatio;
    setEditorRatio(clamp(ratio, EDITOR_RATIO_MIN, EDITOR_RATIO_MAX));
  };
  const handleRatioDragEnd = () => {
    draggingRatioRef.current = false;
  };

  if (loadError) {
    return <p className="p-6 text-sm text-red-600">{loadError}</p>;
  }

  if (savedContent === null) {
    return <p className="p-6 text-sm text-neutral-400">読み込み中...</p>;
  }

  const editorPane = (
    <textarea
      key="editor"
      ref={textareaRef}
      value={editedContent}
      onChange={(e) => setEditedContent(e.target.value)}
      onScroll={handleEditorScroll}
      spellCheck={false}
      style={viewMode === "both" ? { width: `${editorRatio * 100}%` } : undefined}
      className={`resize-none overflow-y-auto p-4 font-mono text-sm outline-none ${
        viewMode === "edit" ? "w-full" : ""
      }`}
    />
  );

  const previewPane = (
    <div
      key="preview"
      ref={previewRef}
      onScroll={handlePreviewScroll}
      style={
        viewMode === "both"
          ? { width: `${(1 - editorRatio) * 100}%` }
          : undefined
      }
      className={`markdown-body overflow-y-auto px-6 py-8 ${
        viewMode === "preview" ? "w-full" : ""
      }`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {previewSource}
      </ReactMarkdown>
    </div>
  );

  const divider = (
    <div
      key="divider"
      onPointerDown={handleRatioDragStart}
      onPointerMove={handleRatioDragMove}
      onPointerUp={handleRatioDragEnd}
      className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-neutral-300 dark:hover:bg-neutral-700"
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasUnsavedChanges || isSaving}
          className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {isSaving ? "保存中…" : "保存"}
        </button>

        <div className="flex overflow-hidden rounded border border-neutral-200 dark:border-neutral-700">
          <button
            type="button"
            onClick={() => setViewMode("edit")}
            className={`px-2 py-1 text-xs ${
              viewMode === "edit" ? "bg-black/10 dark:bg-white/15" : ""
            }`}
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => setViewMode("both")}
            className={`border-l border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700 ${
              viewMode === "both" ? "bg-black/10 dark:bg-white/15" : ""
            }`}
          >
            両方
          </button>
          <button
            type="button"
            onClick={() => setViewMode("preview")}
            className={`border-l border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700 ${
              viewMode === "preview" ? "bg-black/10 dark:bg-white/15" : ""
            }`}
          >
            プレビュー
          </button>
        </div>

        {viewMode === "both" && (
          <>
            <button
              type="button"
              onClick={() => setIsSwapped(!isSwapped)}
              title="編集とプレビューを入れ替え"
              className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-black/5 dark:border-neutral-700 dark:hover:bg-white/10"
            >
              ⇄ 入替
            </button>
            <button
              type="button"
              onClick={() => setIsScrollSynced(!isScrollSynced)}
              title="スクロール同期"
              className={`rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700 ${
                isScrollSynced ? "bg-black/10 dark:bg-white/15" : ""
              }`}
            >
              スクロール同期
            </button>
          </>
        )}

        {hasUnsavedChanges && !isSaving && (
          <span className="text-xs text-neutral-500">未保存の変更があります</span>
        )}
        {saveError && <span className="text-xs text-red-600">{saveError}</span>}
      </div>

      <div ref={splitContainerRef} className="flex min-h-0 flex-1">
        {viewMode === "edit" && editorPane}
        {viewMode === "preview" && previewPane}
        {viewMode === "both" &&
          (isSwapped
            ? [previewPane, divider, editorPane]
            : [editorPane, divider, previewPane])}
      </div>
    </div>
  );
}

function ResolvedImage({
  rootHandle,
  basePath,
  src,
  alt,
}: {
  rootHandle: FileSystemDirectoryHandle;
  basePath: string;
  src: string;
  alt?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  // srcが変わったら、前の画像を表示し続けないようリセットする（同上のレンダー中調整パターン）
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setUrl(null);
  }

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    if (!src) {
      return;
    }

    resolveRelativePath(rootHandle, basePath, src)
      .then((handle) => {
        // resolveRelativePathは絶対URL/データURLの場合nullを返すので、そのままsrcを使う
        if (!handle) {
          if (!cancelled) setUrl(src);
          return null;
        }
        return handle.getFile();
      })
      .then((file) => {
        if (!file || cancelled) return;
        objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [rootHandle, basePath, src]);

  if (!url) {
    return (
      <span className="text-xs text-neutral-400">
        [画像を読み込み中: {alt || src}]
      </span>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt ?? ""} />;
}
