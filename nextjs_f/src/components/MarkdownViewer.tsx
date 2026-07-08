"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { resolveRelativePath, type FileEntry } from "@/lib/fsAccess";

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

interface MarkdownViewerProps {
  rootHandle: FileSystemDirectoryHandle;
  entry: FileEntry;
  onContentLoaded?: (path: string, content: string) => void;
}

export function MarkdownViewer({
  rootHandle,
  entry,
  onContentLoaded,
}: MarkdownViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // entry（表示中のファイル）が変わったら、前のファイルの内容を表示し続けないようリセットする
  // (レンダー中にstateを調整するReact推奨パターン: https://react.dev/learn/you-might-not-need-an-effect)
  const [prevEntry, setPrevEntry] = useState(entry);
  if (entry !== prevEntry) {
    setPrevEntry(entry);
    setContent(null);
    setError(null);
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
          setContent(text);
          onContentLoadedRef.current?.(entry.path, text);
        }
      })
      .catch(() => {
        if (!cancelled) setError("ファイルの読み込みに失敗しました。");
      });

    return () => {
      cancelled = true;
    };
  }, [entry]);

  const body = useMemo(() => {
    if (content === null) return null;
    return content.replace(FRONTMATTER_PATTERN, "");
  }, [content]);

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

  if (error) {
    return <p className="p-6 text-sm text-red-600">{error}</p>;
  }

  if (body === null) {
    return <p className="p-6 text-sm text-neutral-400">読み込み中...</p>;
  }

  return (
    <article className="markdown-body mx-auto max-w-3xl px-6 py-8">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </article>
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
