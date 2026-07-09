import type { FileEntry } from "@/lib/fsAccess";

const CONCURRENCY = 6;

/**
 * entries の本文をバックグラウンドで読み込みキャッシュに蓄積する。
 * 1ファイル読み終えるたびに onUpdate(path, content) を呼び、呼び出し側で逐次反映できるようにする。
 * signal が中断されたら以降の読み込みを中止する（フォルダ切り替え時に前のインデックス作成を打ち切るため）。
 */
export async function buildContentCache(
  entries: FileEntry[],
  onUpdate: (path: string, content: string) => void,
  signal: AbortSignal
): Promise<void> {
  let index = 0;

  async function worker(): Promise<void> {
    while (index < entries.length) {
      if (signal.aborted) return;
      const entry = entries[index];
      index += 1;
      try {
        const file = await entry.handle.getFile();
        const text = await file.text();
        if (signal.aborted) return;
        onUpdate(entry.path, text);
      } catch {
        // 読み込めないファイルは検索対象から除外するだけで、全体は継続する
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, entries.length) }, () =>
    worker()
  );
  await Promise.all(workers);
}

export interface SearchResult {
  entry: FileEntry;
  snippet: string | null;
  matchIndex: number;
}

const SNIPPET_RADIUS = 40;

// frontmatterのtags等も検索対象に含めるため、本文検索はfrontmatterを除去せず生テキストのまま行う
function buildSnippet(content: string, query: string): string | null {
  const lowerBody = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchAt = lowerBody.indexOf(lowerQuery);
  if (matchAt === -1) return null;

  const start = Math.max(0, matchAt - SNIPPET_RADIUS);
  const end = Math.min(content.length, matchAt + query.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  const snippet = content.slice(start, end).replace(/\s+/g, " ").trim();
  return `${prefix}${snippet}${suffix}`;
}

/**
 * ファイル名は常に検索対象、本文は contentCache にキャッシュ済みの範囲のみ対象にする
 * （インデックス作成が完了していないファイルは本文検索からは漏れるが、キャッシュが埋まるにつれ結果が増えていく）。
 */
export function searchEntries(
  entries: FileEntry[],
  contentCache: Map<string, string>,
  query: string
): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const lowerQuery = trimmed.toLowerCase();

  const results: SearchResult[] = [];
  for (const entry of entries) {
    const nameMatch = entry.path.toLowerCase().includes(lowerQuery);
    const content = contentCache.get(entry.path);
    const snippet = content ? buildSnippet(content, trimmed) : null;

    if (nameMatch || snippet) {
      results.push({
        entry,
        snippet,
        matchIndex: entry.path.toLowerCase().indexOf(lowerQuery),
      });
    }
  }

  results.sort((a, b) => a.entry.path.localeCompare(b.entry.path, "ja"));
  return results;
}
