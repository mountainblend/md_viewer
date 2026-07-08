"use client";

import { useEffect, useState } from "react";

/**
 * localStorageに永続化するstate。SSR/静的書き出し時はlocalStorageが存在しないため、
 * 初回レンダーは常にdefaultValueを返し、マウント後に保存値へ更新する。
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) setValue(JSON.parse(raw) as T);
      } catch {
        // 読み込みに失敗した場合はdefaultValueのまま続行する
      }
      setHydrated(true);
    })();
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 保存に失敗しても画面上の動作は継続する
    }
  }, [key, value, hydrated]);

  return [value, setValue];
}
