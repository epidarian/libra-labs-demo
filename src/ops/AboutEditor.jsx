import { useEffect, useId, useState } from "react";
import { nsfwCatalog } from "../nsfw/catalog.js";
import { sfwCatalog } from "../sfw/catalog.js";
import { ops } from "./api.js";
import { Notice } from "./Notice.jsx";

const DEFAULTS = { sfw: sfwCatalog.about, nsfw: nsfwCatalog.about };

function toForm(about) {
  return { title: about.title, body: about.paragraphs.join("\n\n") };
}

export function AboutEditor() {
  const id = useId();
  const [rating, setRating] = useState("sfw");
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancel = false;
    setForm(null);
    setMessage(null);
    setError(null);
    fetch("/api/content")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Could not load content."))))
      .then((content) => {
        if (cancel) return;
        const custom = content.about?.[rating] ?? null;
        setSaved(custom);
        setForm(toForm(custom ?? DEFAULTS[rating]));
      })
      .catch((err) => !cancel && setError(err.message));
    return () => {
      cancel = true;
    };
  }, [rating]);

  const paragraphs = (form?.body ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const save = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      const next = await ops(`about/${rating}`, {
        method: "PUT",
        body: { title: form.title, paragraphs },
      });
      setSaved(next);
      setMessage("Saved. The public About page now shows this text.");
    } catch (err) {
      setError(err.message);
    }
  };

  const reset = async () => {
    if (!window.confirm("Replace the saved text with the built-in default?")) return;
    setError(null);
    try {
      await ops(`about/${rating}`, { method: "PUT", body: { reset: true } });
      setSaved(null);
      setForm(toForm(DEFAULTS[rating]));
      setMessage("Reset to the built-in default.");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="panel ops__section">
      <div className="ops__bar">
        <h2 className="panel__title">About page</h2>
        <div className="ops__filters" role="group" aria-label="Catalog">
          {["sfw", "nsfw"].map((value) => (
            <button
              key={value}
              type="button"
              className="ops__btn"
              aria-pressed={rating === value}
              onClick={() => setRating(value)}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <p className="ops__muted">
        {saved ? "Showing saved text." : "No saved text. The site shows the built-in default below."}
      </p>
      <Notice error={error} loading={!form && !error} />
      {form ? (
        <form className="ops__form" onSubmit={save}>
          <div className="field">
            <label htmlFor={`${id}-title`}>Title</label>
            <input
              id={`${id}-title`}
              value={form.title}
              maxLength={80}
              onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-body`}>Text (blank line between paragraphs)</label>
            <textarea
              id={`${id}-body`}
              rows={10}
              value={form.body}
              onChange={(event) => setForm((f) => ({ ...f, body: event.target.value }))}
              required
            />
          </div>
          <div className="ops__actions">
            <button type="submit" className="btn" disabled={!paragraphs.length}>
              Save
            </button>
            <button type="button" className="btn btn--quiet" disabled={!saved} onClick={reset}>
              Reset to default
            </button>
            <span className="ops__muted" aria-live="polite">
              {message || `${paragraphs.length} paragraph${paragraphs.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </form>
      ) : null}
    </section>
  );
}
