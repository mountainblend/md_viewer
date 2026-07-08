"use client";

import { useMemo, useState } from "react";
import type { FileEntry } from "@/lib/fsAccess";

interface TreeNode {
  name: string;
  path: string;
  type: "folder" | "file";
  children: TreeNode[];
}

function buildTree(entries: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const entry of entries) {
    const segments = entry.path.split("/");
    let children = root;
    let currentPath = "";

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isFile = index === segments.length - 1;
      const type: TreeNode["type"] = isFile ? "file" : "folder";

      let node = children.find((n) => n.name === segment && n.type === type);
      if (!node) {
        node = { name: segment, path: currentPath, type, children: [] };
        children.push(node);
      }
      children = node.children;
    });
  }

  sortTree(root);
  return root;
}

function sortTree(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "ja");
  });
  nodes.forEach((n) => sortTree(n.children));
}

function collectFolderPaths(nodes: TreeNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === "folder") {
      out.push(node.path);
      collectFolderPaths(node.children, out);
    }
  }
  return out;
}

interface FileTreeProps {
  entries: FileEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function FileTree({ entries, selectedPath, onSelect }: FileTreeProps) {
  const tree = useMemo(() => buildTree(entries), [entries]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    new Set(collectFolderPaths(tree))
  );

  // ファイル一覧（tree）が更新されるたびに、全フォルダを畳んだ状態にリセットする
  // (レンダー中にstateを調整するReact推奨パターン: https://react.dev/learn/you-might-not-need-an-effect)
  const [prevTree, setPrevTree] = useState(tree);
  if (tree !== prevTree) {
    setPrevTree(tree);
    setCollapsed(new Set(collectFolderPaths(tree)));
  }

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (tree.length === 0) {
    return (
      <p className="px-2 py-1 text-sm text-neutral-400">
        Markdownファイルが見つかりませんでした。
      </p>
    );
  }

  return (
    <ul className="text-sm">
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          collapsed={collapsed}
          onToggle={toggle}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  depth,
  collapsed,
  onToggle,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const paddingLeft = depth * 14 + 8;

  if (node.type === "folder") {
    const isCollapsed = collapsed.has(node.path);
    return (
      <li>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10"
          style={{ paddingLeft }}
        >
          <span className="inline-block w-3 text-[10px] text-neutral-400">
            {isCollapsed ? "▶" : "▼"}
          </span>
          <span className="truncate" translate="no">
            {node.name}
          </span>
        </button>
        {!isCollapsed && node.children.length > 0 && (
          <ul>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isSelected = node.path === selectedPath;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={`block w-full truncate rounded px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10 ${
          isSelected ? "bg-black/10 font-medium dark:bg-white/15" : ""
        }`}
        style={{ paddingLeft: paddingLeft + 15 }}
        translate="no"
      >
        {node.name}
      </button>
    </li>
  );
}
