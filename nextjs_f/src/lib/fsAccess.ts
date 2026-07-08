export interface VaultFileEntry {
  path: string;
  handle: FileSystemFileHandle;
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickVaultDirectory(): Promise<FileSystemDirectoryHandle> {
  return window.showDirectoryPicker({ mode: "read" });
}

export async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  requestIfNeeded: boolean
): Promise<boolean> {
  const descriptor: FileSystemHandlePermissionDescriptor = { mode: "read" };

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
  out: VaultFileEntry[]
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
): Promise<VaultFileEntry[]> {
  const out: VaultFileEntry[] = [];
  await walk(root, root, "", out);
  return out;
}

function isAbsoluteUrl(src: string): boolean {
  return /^([a-z][a-z0-9+.-]*:)?\/\//i.test(src) || src.startsWith("data:");
}

/**
 * Markdown内の相対パス（画像リンク等）を、参照元ファイルのパスを基点にVaultルートからたどって解決する。
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
  const isVaultRoot = decoded.startsWith("/");
  const baseSegments = isVaultRoot ? [] : basePath.split("/").slice(0, -1);
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
