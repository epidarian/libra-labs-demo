import { useCallback, useEffect, useState } from "react";
import { demoCleared } from "../demoMode.js";
import { demoOpsOpen } from "./demoAccess.js";
import { demoOps, demoUpload } from "./demoStore.js";

export async function opsUpload(path, file, fields) {
  if (!demoCleared() && demoOpsOpen()) return demoUpload(path, file, fields);
  const params = new URLSearchParams(fields);
  const res = await fetch(`/api/ops/${path}?${params}`, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

export async function ops(path, { method = "GET", body } = {}) {
  if (!demoCleared() && demoOpsOpen()) return demoOps(path, { method, body });
  const res = await fetch(`/api/ops/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

export function useOps(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    ops(path)
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, [path]);

  useEffect(reload, [reload]);

  const run = useCallback(
    async (request) => {
      setError(null);
      try {
        const result = await request();
        reload();
        return result;
      } catch (err) {
        setError(err.message);
        return null;
      }
    },
    [reload]
  );

  return { data, error, run };
}

export const shortDate = (iso) => (iso ? String(iso).slice(0, 10) : "-");
