"use client";

import { useEffect, useState } from "react";

/**
 * layout.tsxのインラインscriptが起動時にすでに<html>へdarkクラスを適用済みのため、
 * ここではその結果をReact stateに反映するだけにする（localStorageを再判定しない）。
 */
export function useTheme(): [boolean, () => void] {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    (async () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    })();
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorageが使えない環境ではテーマ切り替え自体は継続する（永続化のみ諦める）
    }
    setIsDark(next);
  };

  return [isDark, toggle];
}
