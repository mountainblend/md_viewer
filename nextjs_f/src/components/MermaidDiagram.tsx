"use client";

import { useEffect, useRef, useState } from "react";

let renderCounter = 0;

interface MermaidDiagramProps {
  code: string;
}

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setError(null);
      renderCounter += 1;
      const id = `mermaid-${renderCounter}`;

      try {
        const { default: mermaid } = await import("mermaid");
        const isDark = document.documentElement.classList.contains("dark");
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
        });

        const { svg } = await mermaid.render(id, code);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch {
        if (!cancelled) {
          setError("Mermaid図の描画に失敗しました（構文を確認してください）。");
        }
      } finally {
        // mermaid.render()は失敗時、レンダリング用の一時要素をdocument.body直下に
        // 残すことがあるため、後始末する
        document.getElementById(`d${id}`)?.remove();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/40">
        {error}
      </div>
    );
  }

  return <div ref={containerRef} className="my-3 flex justify-center" />;
}
