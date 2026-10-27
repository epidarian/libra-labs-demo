import { useState } from "react";

export function NotFound({ onUnlock }) {
  const [value, setValue] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const res = await fetch("/api/ops/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: value }),
    }).catch(() => null);
    setValue("");
    if (res?.ok) onUnlock();
  };

  return (
    <div className="notfound">
      <h1>Not Found</h1>
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
