import { useEffect, useState } from "react";
import { nsfwCatalog } from "../nsfw/catalog.js";
import { sfwCatalog } from "../sfw/catalog.js";
import { ops } from "./api.js";
import { demoCleared } from "../demoMode.js";
import { demoOpsOpen } from "./demoAccess.js";
import { demoContent } from "./demoStore.js";
import { Confirm, useConfirm } from "./Modal.jsx";
import { Notice } from "./Notice.jsx";
import { Field, SaveBar, SectionHead, Segmented, useDirty, useToast } from "./ui.jsx";

const DEFAULTS = { sfw: sfwCatalog.about, nsfw: nsfwCatalog.about };
const SITES = [
  { value: "sfw", label: "SFW" },
  { value: "nsfw", label: "NSFW" },
];
const MAX_TITLE = 80;
const MAX_PARAGRAPHS = 20;
const MAX_PARAGRAPH_LENGTH = 2000;

function toForm(about) {
  return { title: about.title, body: about.paragraphs.join("\n\n") };
}

export function AboutEditor() {
  const toast = useToast();
  const [rating, setRating] = useState("sfw");
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [start, setStart] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [switching, setSwitching] = useState(null);
  const [ask, confirmDialog] = useConfirm();
  const site = rating.toUpperCase();

  useEffect(() => {
    let cancel = false;
    setForm(null);
    setError(null);
    (!demoCleared() && demoOpsOpen()
      ? Promise.resolve(demoContent())
      : fetch("/api/content").then((res) =>
          res.ok ? res.json() : Promise.reject(new Error("Could not load the About text."))
        ))
      .then((content) => {
        if (cancel) return;
        const custom = content.about?.[rating] ?? null;
        const next = toForm(custom ?? DEFAULTS[rating]);
        setSaved(custom);
        setStart(next);
        setForm(next);
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
  const dirty = Boolean(form && start) && (form.title !== start.title || form.body !== start.body);
  const tooLong = paragraphs.findIndex((p) => p.length > MAX_PARAGRAPH_LENGTH);
  const blocked = !form
    ? null
    : !form.title.trim()
      ? "Needs a title"
      : !paragraphs.length
        ? "Needs some text"
        : paragraphs.length > MAX_PARAGRAPHS
          ? `At most ${MAX_PARAGRAPHS} paragraphs`
          : tooLong >= 0
            ? `Paragraph ${tooLong + 1} is over ${MAX_PARAGRAPH_LENGTH} characters`
            : null;
  useDirty(dirty, `About page (${site})`);

  const pick = (next) => {
    if (next === rating) return;
    if (dirty) setSwitching(next);
    else setRating(next);
  };

  const save = async (event) => {
    event.preventDefault();
    if (blocked) return;
    setSaving(true);
    try {
      const next = await ops(`about/${rating}`, { method: "PUT", body: { title: form.title, paragraphs } });
      const stored = toForm(next);
      setSaved(next);
      setStart(stored);
      setForm(stored);
      toast.ok(`${site} About page saved.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () =>
    ask({
      title: `Restore the built-in ${site} text?`,
      body: "Your saved text for this site is thrown away.",
      label: "Restore",
      action: async () => {
        await ops(`about/${rating}`, { method: "PUT", body: { reset: true } });
        const next = toForm(DEFAULTS[rating]);
        setSaved(null);
        setStart(next);
        setForm(next);
      },
      done: `${site} About page restored to the built-in text.`,
    });

  return (
    <section className="panel ops__section">
      <SectionHead title="Text">
        <Segmented label="Site to edit" value={rating} onChange={pick} options={SITES} />
      </SectionHead>
      <Notice error={error} loading={!form && !error} />
      {form ? (
        <div className="about-edit">
          <form className="ops__form" onSubmit={save}>
            <Field label="Title">
              {(props) => (
                <input
                  {...props}
                  value={form.title}
                  maxLength={MAX_TITLE}
                  onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))}
                />
              )}
            </Field>
            <Field label="Text" help="Leave a blank line between paragraphs.">
              {(props) => (
                <textarea
                  {...props}
                  rows={14}
                  value={form.body}
                  onChange={(event) => setForm((f) => ({ ...f, body: event.target.value }))}
                />
              )}
            </Field>
            <SaveBar dirty={dirty} saving={saving} onDiscard={() => setForm(start)} blocked={blocked}>
              <span className="ops__spacer" />
              <button
                type="button"
                className="ops__btn"
                disabled={!saved || saving}
                title={saved ? "Throw away the saved text and show the built-in one" : "The site is already showing the built-in text"}
                onClick={reset}
              >
                Restore built-in text
              </button>
            </SaveBar>
          </form>
          <aside className="about-preview" aria-label="Preview">
            <span className="field__label">Preview</span>
            <h3>{form.title}</h3>
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </aside>
        </div>
      ) : null}
      {switching ? (
        <Confirm
          title="Discard changes?"
          body={`The ${site} text has unsaved changes.`}
          label="Discard"
          cancelLabel="Keep editing"
          onConfirm={() => {
            setRating(switching);
            setSwitching(null);
          }}
          onClose={() => setSwitching(null)}
        />
      ) : null}
      {confirmDialog}
    </section>
  );
}
