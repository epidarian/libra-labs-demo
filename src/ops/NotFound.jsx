import { useEffect, useState } from "react";
import { loadDemoMode } from "../demoMode.js";
import { acceptDemoCode, workerAnswered } from "./demoAccess.js";

export function NotFound({ onUnlock }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const previous = document.title;
    document.title = "404 Not Found";
    return () => {
      document.title = previous;
    };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!onUnlock) return;
    const code = value;
    await loadDemoMode();
    const res = await fetch("/api/ops/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    setValue("");
    if (res?.ok || (!workerAnswered(res) && acceptDemoCode(code))) onUnlock();
  };

  return (
    <div className="notfound">
      <h1>404 Not Found</h1>
      <p>The requested URL was not found on this server.</p>
      <form onSubmit={submit}>
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </form>
      <hr />
      <address>Server at {window.location.host}</address>
    </div>
  );
}
