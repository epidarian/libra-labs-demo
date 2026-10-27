import { demoCleared } from "../demoMode.js";

const KEY = "libra-ops-demo";
const DEMO_CODE = "cumin";

export function workerAnswered(res) {
  const type = res?.headers?.get("content-type") || "";
  return type.includes("json");
}

export function demoOpsOpen() {
  if (demoCleared()) return false;
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function acceptDemoCode(code) {
  if (demoCleared()) return false;
  if (String(code).trim() !== DEMO_CODE) return false;
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* private mode still unlocks for this load */
  }
  return true;
}
