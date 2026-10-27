const KEY = "libra-ops-demo";

let allowed = null;
let pending = null;

export function demoCleared() {
  return allowed === false;
}

export function loadDemoMode() {
  if (allowed !== null) return Promise.resolve(allowed);
  if (!pending) {
    pending = fetch("/api/content")
      .then(async (res) => {
        const type = res.headers.get("content-type") || "";
        if (!res.ok || !type.includes("json")) return true;
        const body = await res.json().catch(() => null);
        return body?.demo !== false;
      })
      .catch(() => true)
      .then((next) => {
        allowed = next;
        if (!next) {
          try {
            sessionStorage.removeItem(KEY);
          } catch {
            /* private mode */
          }
        }
        return next;
      });
  }
  return pending;
}
