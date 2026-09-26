"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * GET `path` on mount / when it changes.
 * `reload()` refetches and resolves with the new data (throws on error).
 */
export function useApi(path) {
  const [state, setState] = useState({ path: null, data: null, error: null });

  useEffect(() => {
    if (!path) return;
    let alive = true;
    api.get(path).then(
      (data) => alive && setState({ path, data, error: null }),
      (e) => alive && setState({ path, data: null, error: e.message })
    );
    return () => {
      alive = false;
    };
  }, [path]);

  const reload = useCallback(async () => {
    const data = await api.get(path);
    setState({ path, data, error: null });
    return data;
  }, [path]);

  const fresh = state.path === path;
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, reload };
}
