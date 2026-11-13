import { useCallback, useEffect, useState } from "react";
import { demoCleared } from "../demoMode.js";
import { demoOpsOpen } from "./demoAccess.js";
import { demoOps, demoUpload } from "./demoStore.js";
import { useToast } from "./ui.jsx";

export async function opsUpload(path, file, fields, onProgress) {
  if (!demoCleared() && demoOpsOpen()) return demoUpload(path, file, fields);
  const params = new URLSearchParams(fields);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/ops/${path}?${params}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
    }
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Request failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("The upload did not reach the server."));
    xhr.onabort = () => reject(new Error("The upload was cancelled."));
    xhr.send(file);
  });
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

/**
 * Loads one ops resource and keeps it fresh after changes.
 *   error       why the list itself could not be loaded
 *   send(fn)    run a change, then reload; throws on failure (for dialogs that show the error)
 *   run(fn, o)  the same, but reports through toasts and returns null on failure;
 *               o.ok is the message (or a function of the result) shown when it worked
 */
export function useOps(path) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    return ops(path)
      .then((next) => {
        setData(next);
        setError(null);
        return next;
      })
      .catch((err) => {
        setError(err.message);
        return null;
      });
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  const send = useCallback(
    async (request) => {
      const result = await request();
      await reload();
      return result;
    },
    [reload]
  );

  const run = useCallback(
    async (request, { ok } = {}) => {
      try {
        const result = await send(request);
        const message = typeof ok === "function" ? ok(result) : ok;
        if (message) toast.ok(message);
        return result ?? true;
      } catch (err) {
        toast.error(err?.message || "Something went wrong.");
        return null;
      }
    },
    [send, toast]
  );

  return { data, error, loading: !data && !error, reload, run, send };
}

export const shortDate = (iso) => (iso ? String(iso).slice(0, 10) : "-");

export function longDate(iso) {
  const [year, month, day] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
