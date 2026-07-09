export interface FileEntry {
  path: string;
  handle: FileSystemFileHandle;
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  return window.showDirectoryPicker({ mode: "readwrite" });
}

export async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  requestIfNeeded: boolean
): Promise<boolean> {
  const descriptor: FileSystemHandlePermissionDescriptor = { mode: "readwrite" };

  if ((await handle.queryPermission(descriptor)) === "granted") {
    return true;
  }
  if (!requestIfNeeded) {
    return false;
  }
  return (await handle.requestPermission(descriptor)) === "granted";
}

async function walk(
  root: FileSystemDirectoryHandle,
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: FileEntry[]
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith(".")) continue;

    const path = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === "directory") {
      await walk(root, handle, path, out);
    } else if (name.toLowerCase().endsWith(".md")) {
      out.push({ path, handle });
    }
  }
}

export async function walkMarkdownFiles(
  root: FileSystemDirectoryHandle
): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  await walk(root, root, "", out);
  return out;
}

function isAbsoluteUrl(src: string): boolean {
  return /^([a-z][a-z0-9+.-]*:)?\/\//i.test(src) || src.startsWith("data:");
}

/**
 * Markdown内の相対パス（画像リンク等）を、参照元ファイルのパスを基点にフォルダルートからたどって解決する。
 * 絶対URL・データURLはnullを返し、呼び出し側でそのまま使わせる。
 */
export async function resolveRelativePath(
  root: FileSystemDirectoryHandle,
  basePath: string,
  relativePath: string
): Promise<FileSystemFileHandle | null> {
  if (!relativePath || isAbsoluteUrl(relativePath)) {
    return null;
  }

  const decoded = decodeURIComponent(relativePath);
  const isFolderRoot = decoded.startsWith("/");
  const baseSegments = isFolderRoot ? [] : basePath.split("/").slice(0, -1);
  const relSegments = decoded.split("/").filter((s) => s.length > 0);

  const segments = [...baseSegments];
  for (const seg of relSegments) {
    if (seg === ".") continue;
    if (seg === "..") {
      segments.pop();
    } else {
      segments.push(seg);
    }
  }

  const fileName = segments.pop();
  if (!fileName) return null;

  let dir = root;
  try {
    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(seg);
    }
    return await dir.getFileHandle(fileName);
  } catch {
    return null;
  }
}

const ATTACHMENTS_DIR_NAME = "attachments";

function splitFileName(name: string): { base: string; ext: string } {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, dotIndex), ext: name.slice(dotIndex) };
}

async function fileExists(
  dir: FileSystemDirectoryHandle,
  name: string
): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * 画像ファイルをフォルダルート直下のattachments/に保存する。
 * 同名ファイルが既にある場合は "name (1).ext" のように連番を付けて衝突を避ける。
 * 挿入用のMarkdownリンクにはフォルダルート相対パス（先頭"/"）を返す。
 */
export async function saveAttachment(
  root: FileSystemDirectoryHandle,
  file: File
): Promise<{ name: string; path: string }> {
  const attachmentsDir = await root.getDirectoryHandle(ATTACHMENTS_DIR_NAME, {
    create: true,
  });

  // クライアントが指定したファイル名からディレクトリ指定を取り除き、ファイル名部分だけを使う
  const rawName = file.name.split(/[/\\]/).pop() || "attachment";
  const { base, ext } = splitFileName(rawName);

  let candidate = rawName;
  let counter = 1;
  while (await fileExists(attachmentsDir, candidate)) {
    candidate = `${base} (${counter})${ext}`;
    counter += 1;
  }

  const handle = await attachmentsDir.getFileHandle(candidate, {
    create: true,
  });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();

  return { name: candidate, path: `/${ATTACHMENTS_DIR_NAME}/${candidate}` };
}

/**
 * フォルダルート直下に新しいMarkdownファイルを作成する。
 * 空文字・区切り文字を含む名前・ドット始まりの名前はエラーにする。
 * ".md"で終わっていなければ自動的に付与する。同名ファイルが既にある場合もエラーにする。
 */
export async function createMarkdownFile(
  root: FileSystemDirectoryHandle,
  rawName: string
): Promise<FileSystemFileHandle> {
  const trimmed = rawName.trim();
  if (!trimmed) {
    throw new Error("ファイル名を入力してください。");
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("ファイル名にフォルダ区切り文字は使えません。");
  }
  if (trimmed.startsWith(".")) {
    throw new Error("ドットで始まるファイル名は使えません。");
  }

  const name = trimmed.toLowerCase().endsWith(".md")
    ? trimmed
    : `${trimmed}.md`;

  if (await fileExists(root, name)) {
    throw new Error("同名のファイルが既に存在します。");
  }

  return root.getFileHandle(name, { create: true });
}
