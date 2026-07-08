export interface FolderRecord {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  lastOpenedAt: number;
}

const DB_NAME = "md-vault-viewer";
const DB_VERSION = 2;
const STORE_FOLDERS = "folders";
const STORE_META = "meta";
const OLD_STORE_HANDLE = "vault-handle";
const ACTIVE_FOLDER_KEY = "activeFolderId";

const MAX_FOLDERS = 3;
const STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30日間開かなかったフォルダは自動削除する

async function getAllFolders(db: IDBDatabase): Promise<FolderRecord[]> {
  return new Promise<FolderRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, "readonly");
    const req = tx.objectStore(STORE_FOLDERS).getAll();
    req.onsuccess = () => resolve(req.result as FolderRecord[]);
    req.onerror = () => reject(req.error);
  });
}

async function deleteFolders(db: IDBDatabase, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_FOLDERS, STORE_META], "readwrite");
    const store = tx.objectStore(STORE_FOLDERS);
    for (const id of ids) store.delete(id);
    const metaStore = tx.objectStore(STORE_META);
    const req = metaStore.get(ACTIVE_FOLDER_KEY);
    req.onsuccess = () => {
      if (ids.includes(req.result as string)) {
        metaStore.delete(ACTIVE_FOLDER_KEY);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 30日間開かれていないフォルダを削除し、残りを新しい順で返す */
async function pruneStaleAndList(db: IDBDatabase): Promise<FolderRecord[]> {
  const all = await getAllFolders(db);
  const now = Date.now();
  const stale = all.filter((f) => now - f.lastOpenedAt > STALE_MS);
  const fresh = all.filter((f) => now - f.lastOpenedAt <= STALE_MS);

  await deleteFolders(db, stale.map((f) => f.id));

  return fresh.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

/** 件数が上限を超えていたら、直近追加分を除いて最も古いものから削除する */
async function enforceMaxFolders(
  db: IDBDatabase,
  keepId: string
): Promise<void> {
  const all = await getAllFolders(db);
  if (all.length <= MAX_FOLDERS) return;

  const removableOldestFirst = all
    .filter((f) => f.id !== keepId)
    .sort((a, b) => a.lastOpenedAt - b.lastOpenedAt);
  const overBy = all.length - MAX_FOLDERS;
  const toRemove = removableOldestFirst.slice(0, overBy);

  await deleteFolders(db, toRemove.map((f) => f.id));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(OLD_STORE_HANDLE)) {
        db.deleteObjectStore(OLD_STORE_HANDLE);
      }
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function generateId(): string {
  return crypto.randomUUID();
}

export async function listFolders(): Promise<FolderRecord[]> {
  const db = await openDb();
  try {
    return await pruneStaleAndList(db);
  } finally {
    db.close();
  }
}

export async function addFolder(
  handle: FileSystemDirectoryHandle
): Promise<FolderRecord> {
  const record: FolderRecord = {
    id: generateId(),
    name: handle.name,
    handle,
    lastOpenedAt: Date.now(),
  };

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_FOLDERS, STORE_META], "readwrite");
      tx.objectStore(STORE_FOLDERS).put(record);
      tx.objectStore(STORE_META).put(record.id, ACTIVE_FOLDER_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await enforceMaxFolders(db, record.id);
    return record;
  } finally {
    db.close();
  }
}

export async function touchFolder(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_FOLDERS, STORE_META], "readwrite");
      const store = tx.objectStore(STORE_FOLDERS);
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as FolderRecord | undefined;
        if (record) {
          record.lastOpenedAt = Date.now();
          store.put(record);
        }
      };
      tx.objectStore(STORE_META).put(id, ACTIVE_FOLDER_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function removeFolder(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_FOLDERS, STORE_META], "readwrite");
      tx.objectStore(STORE_FOLDERS).delete(id);
      const metaStore = tx.objectStore(STORE_META);
      const req = metaStore.get(ACTIVE_FOLDER_KEY);
      req.onsuccess = () => {
        if (req.result === id) {
          metaStore.delete(ACTIVE_FOLDER_KEY);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getActiveFolderId(): Promise<string | null> {
  const db = await openDb();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE_META, "readonly");
      const req = tx.objectStore(STORE_META).get(ACTIVE_FOLDER_KEY);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function setActiveFolderId(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_META, "readwrite");
      tx.objectStore(STORE_META).put(id, ACTIVE_FOLDER_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
