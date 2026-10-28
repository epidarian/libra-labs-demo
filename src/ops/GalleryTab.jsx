import { useId, useState } from "react";
import { usePatreonLive } from "../patreon.js";
import { ops, opsUpload, useOps } from "./api.js";
import { beginCreatorConnect, useCreatorReturn } from "./creatorConnect.js";
import { Notice } from "./Notice.jsx";

function blankForm() {
  return {
    title: "",
    description: "",
    year: String(new Date().getFullYear()),
    rating: "sfw",
    patronsOnly: false,
    minCents: "",
    published: false,
    tags: [],
  };
}

const SLOT_LABEL = { thumb: "Thumbnail", full: "Picture", extra: "Other files" };

function sizeLabel(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function flagsOf(file) {
  return {
    viewable: !!file.viewable,
    downloadable: !!file.downloadable,
    patronsOnly: !!file.patronsOnly,
  };
}

function FlagSet({ flags, onChange }) {
  const set = (key) => onChange({ ...flags, [key]: !flags[key] });
  return (
    <div className="ops__actions">
      <label className="ops__check">
        <input type="checkbox" checked={flags.viewable} onChange={() => set("viewable")} />
        Viewable
      </label>
      <label className="ops__check">
        <input type="checkbox" checked={flags.downloadable} onChange={() => set("downloadable")} />
        Downloadable
      </label>
      <label className="ops__check">
        <input type="checkbox" checked={flags.patronsOnly} onChange={() => set("patronsOnly")} />
        Patrons only
      </label>
    </div>
  );
}

function PieceForm({ initial, tiers = [], onSave, onCancel }) {
  const id = useId();
  const [form, setForm] = useState(initial);
  const [tag, setTag] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const addTag = () => {
    const next = tag.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 32);
    setTag("");
    if (!next || form.tags?.includes(next)) return;
    setForm((current) => ({ ...current, tags: [...(current.tags || []), next] }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const ok = await onSave(form);
    setSaving(false);
    if (ok && !initial.id) setForm(blankForm());
  };

  return (
    <form className="ops__form" onSubmit={submit}>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-title`}>Title</label>
          <input id={`${id}-title`} value={form.title} onChange={set("title")} required />
        </div>
        <div className="field">
          <label htmlFor={`${id}-year`}>Year</label>
          <input id={`${id}-year`} value={form.year} onChange={set("year")} inputMode="numeric" maxLength={4} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-rating`}>Shown on</label>
          <select id={`${id}-rating`} value={form.rating} onChange={set("rating")}>
            <option value="sfw">SFW site</option>
            <option value="nsfw">NSFW site</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-tier`}>Tier</label>
          <select id={`${id}-tier`} value={form.minCents ?? ""} onChange={set("minCents")}>
            <option value="">Anyone</option>
            {form.minCents !== "" &&
            form.minCents != null &&
            !tiers.some((tier) => String(tier.amountCents) === String(form.minCents)) ? (
              <option value={String(form.minCents)}>${Number(form.minCents) / 100}</option>
            ) : null}
            {tiers.map((tier) => (
              <option key={tier.id} value={String(tier.amountCents)}>
                {tier.title} · ${tier.amountCents / 100}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-description`}>Description</label>
        <textarea id={`${id}-description`} value={form.description} onChange={set("description")} />
      </div>
      {!initial.id ? (
        <div className="field">
          <label htmlFor={`${id}-tag`}>Tags</label>
          <div className="ops__tags">
            {(form.tags || []).map((name) => (
              <button
                type="button"
                className="ops__tag ops__tagbtn"
                key={name}
                onClick={() =>
                  setForm((current) => ({ ...current, tags: current.tags.filter((item) => item !== name) }))
                }
              >
                {name} ×
              </button>
            ))}
            <input
              id={`${id}-tag`}
              className="ops__taginput"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addTag();
              }}
            />
            <button type="button" className="ops__btn" onClick={addTag} disabled={!tag.trim()}>
              Add
            </button>
          </div>
        </div>
      ) : null}
      <div className="ops__actions">
        <label className="ops__check">
          <input
            type="checkbox"
            checked={form.patronsOnly}
            onChange={(event) => setForm((current) => ({ ...current, patronsOnly: event.target.checked }))}
          />
          Patrons only
        </label>
        <label className="ops__check">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(event) => setForm((current) => ({ ...current, published: event.target.checked }))}
          />
          Visible
        </label>
      </div>
      <div className="ops__actions">
        <button type="submit" className="btn" disabled={saving}>
          {initial.id ? "Save" : "Create folder"}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn--quiet" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function UploadSlot({ work, slot, run }) {
  const defaults =
    slot === "extra"
      ? { viewable: false, downloadable: true, patronsOnly: false }
      : { viewable: true, downloadable: false, patronsOnly: false };
  const [flags, setFlags] = useState(defaults);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = async (event) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    await run(() =>
      opsUpload(`gallery/${work.id}/files`, file, {
        slot,
        name: file.name,
        viewable: flags.viewable ? "1" : "0",
        downloadable: flags.downloadable ? "1" : "0",
        patrons_only: flags.patronsOnly ? "1" : "0",
      })
    );
    setBusy(false);
    setFile(null);
    event.target.reset();
  };

  return (
    <form className="ops__file" onSubmit={send}>
      <strong>{SLOT_LABEL[slot]}</strong>
      <FlagSet flags={flags} onChange={setFlags} />
      <div className="ops__actions">
        <input
          type="file"
          accept={slot === "extra" ? undefined : "image/*"}
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
        <button type="submit" className="ops__btn" disabled={!file || busy}>
          Upload
        </button>
      </div>
    </form>
  );
}

function StoredFile({ work, file, run }) {
  const saveFlags = (next) =>
    run(() => ops(`gallery/${work.id}/files/${file.id}`, { method: "PATCH", body: next }));
  const replace = (event) => {
    const next = event.target.files?.[0];
    event.target.value = "";
    if (!next) return;
    run(() =>
      opsUpload(`gallery/${work.id}/files`, next, {
        slot: file.slot,
        name: next.name,
        viewable: file.viewable ? "1" : "0",
        downloadable: file.downloadable ? "1" : "0",
        patrons_only: file.patronsOnly ? "1" : "0",
      })
    );
  };
  const remove = () => {
    if (!window.confirm(`Delete ${file.name}?`)) return;
    run(() => ops(`gallery/${work.id}/files/${file.id}`, { method: "DELETE" }));
  };

  return (
    <div className="ops__file">
      <div>
        <strong>{SLOT_LABEL[file.slot] || file.name}</strong>
        <span className="ops__muted">
          {" "}
          {file.name} {sizeLabel(file.bytes)}
        </span>
      </div>
      {file.contentType.startsWith("image/") ? (
        <img className="ops__thumb" alt="" src={`/api/ops/gallery/${work.id}/files/${file.id}`} />
      ) : null}
      <FlagSet flags={flagsOf(file)} onChange={saveFlags} />
      {file.slot === "thumb" ? null : (
        <div className="ops__actions">
          <label className="ops__btn">
            Replace
            <input type="file" hidden onChange={replace} />
          </label>
          <button type="button" className="ops__btn ops__btn--danger" onClick={remove}>
            Delete file
          </button>
        </div>
      )}
    </div>
  );
}

function WorkTags({ work, run }) {
  const [tag, setTag] = useState("");
  const add = (event) => {
    event.preventDefault();
    if (!tag.trim()) return;
    run(() => ops(`gallery/${work.id}/tags`, { method: "POST", body: { tag } }));
    setTag("");
  };
  const remove = (name) =>
    run(() => ops(`gallery/${work.id}/tags/${encodeURIComponent(name)}`, { method: "DELETE" }));

  return (
    <form className="ops__file" onSubmit={add}>
      <strong>Tags</strong>
      <p className="ops__muted">If this is not visible, only an account with the same tag can see it.</p>
      <div className="ops__tags">
        {(work.tags || []).map((name) => (
          <button type="button" className="ops__tag ops__tagbtn" key={name} onClick={() => remove(name)}>
            {name} ×
          </button>
        ))}
        <input
          className="ops__taginput"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          aria-label="Add a tag"
          placeholder="Add a tag"
        />
        <button type="submit" className="ops__btn" disabled={!tag.trim()}>
          Add
        </button>
      </div>
    </form>
  );
}

function PieceEditor({ work, tiers, run, onClose }) {
  const save = (form) =>
    run(() => ops(`gallery/${work.id}`, { method: "PUT", body: { ...form, id: work.id } }));
  const thumb = work.files.find((file) => file.slot === "thumb");
  const full = work.files.find((file) => file.slot === "full");
  const extras = work.files.filter((file) => file.slot === "extra");

  return (
    <div className="ops__request">
      <p className="ops__folder">{work.folder}</p>
      <PieceForm
        initial={{
          id: work.id,
          title: work.title,
          description: work.description || "",
          year: work.year || String(new Date().getFullYear()),
          rating: work.rating,
          patronsOnly: work.patronsOnly,
          minCents: work.minCents ?? "",
          published: work.published,
        }}
        tiers={tiers}
        onSave={async (form) => {
          const ok = await save(form);
          return Boolean(ok);
        }}
        onCancel={onClose}
      />
      {full && !thumb ? (
        <p className="ops__error" role="status">
          A thumbnail still needs to be generated.
        </p>
      ) : null}
      {thumb ? <StoredFile work={work} file={thumb} run={run} /> : null}
      {full ? <StoredFile work={work} file={full} run={run} /> : <UploadSlot work={work} slot="full" run={run} />}
      {extras.map((file) => (
        <StoredFile key={file.id} work={work} file={file} run={run} />
      ))}
      <UploadSlot work={work} slot="extra" run={run} />
      <WorkTags work={work} run={run} />
    </div>
  );
}

function marks(work, tiers) {
  const parts = [work.rating.toUpperCase()];
  if (!work.published) parts.push("Hidden");
  if (work.patronsOnly) parts.push("Patrons");
  if (work.minCents != null) {
    parts.push(tiers.find((tier) => tier.amountCents === work.minCents)?.title || `$${work.minCents / 100}`);
  }
  if (work.files.some((file) => file.slot === "full") && !work.files.some((file) => file.slot === "thumb")) {
    parts.push("No thumbnail");
  }
  return [...parts, ...(work.tags || [])].join(" · ");
}

export function GalleryTab() {
  const { data, error, run } = useOps("gallery");
  const patreonLive = usePatreonLive();
  useCreatorReturn(run);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [rating, setRating] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const works = data?.works ?? [];
  const tiers = data?.tiers ?? [];
  const patreon = data?.patreon;
  const needle = query.trim().toLowerCase();
  const shown = works.filter((work) => {
    if (rating !== "all" && work.rating !== rating) return false;
    if (visibility === "visible" && !work.published) return false;
    if (visibility === "hidden" && work.published) return false;
    if (!needle) return true;
    return (
      work.title.toLowerCase().includes(needle) ||
      (work.tags || []).some((tag) => tag.includes(needle))
    );
  });
  const active = works.find((work) => work.id === editing) || null;

  const create = async (form) => {
    const result = await run(() => ops("gallery", { method: "POST", body: form }));
    if (result?.work) {
      setCreating(false);
      setEditing(result.work.id);
    }
    return Boolean(result);
  };

  const connect = () => beginCreatorConnect("gallery");

  const refreshTiers = () => run(() => ops("gallery/tiers", { method: "POST" }));

  const disconnect = () => {
    if (!window.confirm("Disconnect the Patreon campaign?")) return;
    run(() => ops("gallery/patreon", { method: "DELETE" }));
  };

  const remove = (work) => {
    if (!window.confirm(`Delete ${work.title} and its folder?`)) return;
    if (editing === work.id) setEditing(null);
    run(() => ops(`gallery/${work.id}`, { method: "DELETE" }));
  };

  const openNew = () => {
    setEditing(null);
    setCreating(true);
  };

  return (
    <div className={creating || active ? "gallery-ops is-open" : "gallery-ops"}>
      <section className="panel ops__section">
        <div className="ops__bar">
          <h2 className="panel__title">Pictures ({shown.length === works.length ? works.length : `${shown.length} / ${works.length}`})</h2>
          <div className="ops__actions">
            <button type="button" className="ops__btn" onClick={openNew} aria-pressed={creating}>
              New
            </button>
            {patreon?.configured && !patreon.connected ? (
              <button type="button" className="ops__btn" onClick={connect} disabled={!patreonLive}>
                Connect Patreon
              </button>
            ) : null}
            {patreon?.connected ? (
              <button type="button" className="ops__btn" onClick={refreshTiers}>
                {patreon.campaign || "Refresh tiers"}
              </button>
            ) : null}
            {patreon?.connected ? (
              <button type="button" className="ops__btn" onClick={disconnect}>
                Disconnect
              </button>
            ) : null}
          </div>
        </div>
        {patreon && !patreon.configured ? (
          <p className="ops__muted">Set the Patreon client id and secret on the worker to load tiers.</p>
        ) : null}
        <div className="ops__filters">
          <input
            className="gallery-find"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Find a picture"
            placeholder="Title or tag"
          />
          <div className="ops__filterset" role="group" aria-label="Site">
            {[
              ["all", "All"],
              ["sfw", "SFW"],
              ["nsfw", "NSFW"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="ops__btn"
                aria-pressed={rating === value}
                onClick={() => setRating(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ops__filterset" role="group" aria-label="Visibility">
            {[
              ["all", "Any"],
              ["visible", "Visible"],
              ["hidden", "Hidden"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="ops__btn"
                aria-pressed={visibility === value}
                onClick={() => setVisibility(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Notice error={error} loading={!data} />
        {data && works.length === 0 ? <p className="ops__muted">No pictures.</p> : null}
        {data && works.length > 0 && shown.length === 0 ? <p className="ops__muted">No matches.</p> : null}
        <div className="gallery-index">
          {shown.map((work) => {
            const thumb = work.files.find((file) => file.slot === "thumb");
            return (
              <button
                type="button"
                className={work.id === editing ? "gallery-row is-selected" : "gallery-row"}
                key={work.id}
                onClick={() => {
                  setCreating(false);
                  setEditing(work.id);
                }}
              >
                {thumb ? (
                  <img alt="" src={`/api/ops/gallery/${work.id}/files/${thumb.id}`} />
                ) : (
                  <span className="gallery-row__empty" />
                )}
                <span>
                  <strong>{work.title}</strong>
                  <small>{marks(work, tiers)}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {creating ? (
        <section className="panel ops__section">
          <div className="ops__bar">
            <h2 className="panel__title">New picture</h2>
          </div>
          <PieceForm initial={blankForm()} tiers={tiers} onSave={create} onCancel={() => setCreating(false)} />
        </section>
      ) : null}
      {active ? (
        <section className="panel ops__section">
          <div className="ops__bar">
            <h2 className="panel__title">{active.title}</h2>
            <button type="button" className="ops__btn ops__btn--danger" onClick={() => remove(active)}>
              Delete
            </button>
          </div>
          <PieceEditor work={active} tiers={tiers} run={run} onClose={() => setEditing(null)} />
        </section>
      ) : null}
    </div>
  );
}
