import { useEffect } from "react";
import { loadDemoMode } from "../demoMode.js";
import { CREATOR_STATE_KEY, creatorAuthorizeUrl, patreonIsLive, redirectUri } from "../patreon.js";
import { ops } from "./api.js";

const RETURN_KEY = "libra-creator-return";

let connectResult = null;
let returnTab = null;
let clearReturn = 0;

function liveReturnTab() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || sessionStorage.getItem(CREATOR_STATE_KEY) !== state) return null;
  return sessionStorage.getItem(RETURN_KEY) || "gallery";
}

export function creatorReturnTab() {
  return liveReturnTab() || returnTab;
}

function exchangeCreatorCode() {
  if (connectResult) return connectResult;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || sessionStorage.getItem(CREATOR_STATE_KEY) !== state) return null;
  returnTab = sessionStorage.getItem(RETURN_KEY) || "gallery";
  clearTimeout(clearReturn);
  // The strict-mode remount re-reads the tab after this function clears the URL.
  clearReturn = setTimeout(() => {
    returnTab = null;
  }, 0);
  sessionStorage.removeItem(CREATOR_STATE_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  window.history.replaceState(null, "", window.location.pathname);
  connectResult = ops("gallery/patreon/connect", {
    method: "POST",
    body: { code, redirect_uri: redirectUri() },
  });
  return connectResult;
}

export function beginCreatorConnect(tab) {
  loadDemoMode().then((demo) => {
    if (demo || !patreonIsLive()) return;
    const state = crypto.randomUUID();
    sessionStorage.setItem(CREATOR_STATE_KEY, state);
    sessionStorage.setItem(RETURN_KEY, tab);
    window.location.assign(creatorAuthorizeUrl(state));
  });
}

export function useCreatorReturn(run) {
  useEffect(() => {
    let active = true;
    loadDemoMode().then((demo) => {
      if (!active || demo) return;
      const pending = exchangeCreatorCode();
      if (!pending) return;
      pending.finally(() => {
        if (active) run(() => pending);
      });
    });
    return () => {
      active = false;
    };
  }, [run]);
}
