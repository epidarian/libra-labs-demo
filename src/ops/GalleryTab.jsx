import { useEffect, useId, useMemo, useState } from "react";
import { usePatreonLive } from "../patreon.js";
import { ops, opsUpload, useOps } from "./api.js";
import { beginCreatorConnect, useCreatorReturn } from "./creatorConnect.js";
import { Dropzone, FileButton, sizeLabel } from "./files.jsx";
import { Modal, useConfirm, useDiscardGuard } from "./Modal.jsx";
import { Notice } from "./Notice.jsx";
import { ThumbStudio } from "./ThumbStudio.jsx";
import { ActionButton, Empty, Field, SectionHead, Segmented, Status, Switch, Tip, plural, useToast } from "./ui.jsx";

const IMAGE_TYPES = ".jpg,.jpeg,.png,.webp,.gif,.avif";
const FILE_TYPES = `${IMAGE_TYPES},.psd,.zip,.pdf,.kra,.clip,.tif,.tiff,.txt`;
const DEFAULT_LIMITS = { file: 100 * 1024 * 1024, thumbSource: 20 * 1024 * 1024 };
const FLAGS = [
  ["viewable", "Viewable", "Can be opened and seen on the site"],
  ["downloadable", "Downloadable", "Offers a download link on the site"],
  ["patronsOnly", "Patrons only", "Only active patrons can see or get this file"],
];
// What the server gives a new extra file when no access is chosen.
const EXTRA_DEFAULTS = { viewable: false, downloadable: true, patronsOnly: false };
const SITE_FILTERS = [
  { value: "all", label: "All" },
  { value: "sfw", label: "SFW" },
  { value: "nsfw", label: "NSFW" },
];

const previewUrl = (work, file) => `/api/ops/gallery/${work.id}/files/${file.id}`;
const isImage = (file) => (file.contentType || file.type || "").startsWith("image/");
const mb = (bytes) => Math.round(bytes / 1048576);
const extOf = (name) => String(name).split(".").pop().toUpperCase().slice(0, 5);

function filesOf(work) {
  return {
    thumb: work.files.find((file) => file.slot === "thumb") || null,
    full: work.files.find((file) => file.slot === "full") || null,
    extras: work.files.filter((file) => file.slot === "extra"),
  };
}

function issuesOf(work) {
  const { thumb, full } = filesOf(work);
  if (!full) return ["No picture"];
  if (!thumb) return ["No thumbnail"];
  return [];
}

function tidyTag(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function titleFromFile(name) {
  const base = String(name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base ? base[0].toUpperCase() + base.slice(1) : "";
}

// Access is stored as two fields; the editor shows them as one choice.
function accessOf(work) {
  if (work.minCents != null && work.minCents !== "") return `tier:${work.minCents}`;
  return work.patronsOnly ? "patrons" : "anyone";
}

function accessFields(access) {
  if (access === "anyone") return { patronsOnly: false, minCents: "" };
  if (access === "patrons") return { patronsOnly: true, minCents: "" };
  return { patronsOnly: true, minCents: access.slice(5) };
}

function detailsOf(work) {
  return {
    title: work.title,
    description: work.description || "",
    year: work.year || String(new Date().getFullYear()),
    rating: work.rating,
    access: accessOf(work),
  };
}

function blankDetails() {
  return { title: "", description: "", year: String(new Date().getFullYear()), rating: "sfw", access: "anyone" };
}

function bodyOf(details, published) {
  const { access, ...rest } = details;
  return { ...rest, ...accessFields(access), published };
}

function sameDetails(a, b) {
  return Object.keys(a).every((key) => String(a[key]) === String(b[key]));
}

function tierName(tiers, cents) {
  if (cents == null || cents === "") return null;
  return tiers.find((tier) => tier.amountCents === Number(cents))?.title || `$${Number(cents) / 100}`;
}

const flagsOf = (file) => ({
  viewable: Boolean(file.viewable),
  downloadable: Boolean(file.downloadable),
  patronsOnly: Boolean(file.patronsOnly),
});
const sameFlags = (a, b) => FLAGS.every(([key]) => Boolean(a[key]) === Boolean(b[key]));
const flagParams = (flags) => ({
  viewable: flags.viewable ? "1" : "0",
  downloadable: flags.downloadable ? "1" : "0",
  patrons_only: flags.patronsOnly ? "1" : "0",
});

function useObjectUrl(file) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return undefined;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function FlagChips({ value, onChange, disabled = false }) {
  return (
    <div className="chips chips--toggle" role="group" aria-label="Access">
      {FLAGS.map(([key, label, help]) => (
        <button
          key={key}
          type="button"
          className="ops__btn ops__btn--small"
          aria-pressed={Boolean(value[key])}
          title={help}
          disabled={disabled}
          onClick={() => onChange({ ...value, [key]: !value[key] })}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function DetailsFields({ form, setForm, tiers, disabled = false }) {
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const customCents = form.access.startsWith("tier:") ? form.access.slice(5) : null;
  const customTier = customCents != null && !tiers.some((tier) => String(tier.amountCents) === customCents);
  return (
    <>
      <div className="field-row field-row--title">
        <Field label="Title">
          {(props) => <input {...props} value={form.title} onChange={set("title")} maxLength={80} disabled={disabled} />}
        </Field>
        <Field label="Year">
          {(props) => (
            <input
              {...props}
              value={form.year}
              onChange={set("year")}
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              disabled={disabled}
            />
          )}
        </Field>
      </div>
      <div className="field-row field-row--2">
        <Field label="Shown on">
          {(props) => (
            <select {...props} value={form.rating} onChange={set("rating")} disabled={disabled}>
              <option value="sfw">SFW site</option>
              <option value="nsfw">NSFW site</option>
            </select>
          )}
        </Field>
        <Field label="Who can see it">
          {(props) => (
            <select {...props} value={form.access} onChange={set("access")} disabled={disabled}>
              <option value="anyone">Anyone</option>
              <option value="patrons">Any patron</option>
              {customTier ? <option value={form.access}>${Number(customCents) / 100} tier and up</option> : null}
              {tiers.map((tier) => (
                <option key={tier.id} value={`tier:${tier.amountCents}`}>
                  {tier.title} (${tier.amountCents / 100}) and up
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label="Description">
        {(props) => (
          <textarea {...props} value={form.description} onChange={set("description")} maxLength={2000} disabled={disabled} />
        )}
      </Field>
    </>
  );
}

function TagEditor({ tags, onChange, suggestions = [], disabled = false }) {
  const [draft, setDraft] = useState("");
  const id = useId();
  const commit = () => {
    const tag = tidyTag(draft);
    setDraft("");
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
  };
  const unused = suggestions.filter((item) => !tags.includes(item));
  return (
    <div className="field">
      <span className="field__top">
        <label htmlFor={`${id}-tag`}>Tags</label>
        <Tip text="Tags help find pictures here. While a picture is hidden, accounts that carry one of its tags can still see it." />
      </span>
      <div className="ops__tags">
        {tags.map((name) => (
          <button
            type="button"
            className="ops__tag ops__tagbtn"
            key={name}
            onClick={() => onChange(tags.filter((tag) => tag !== name))}
            disabled={disabled}
            title="Click to remove"
            aria-label={`Remove tag ${name}`}
          >
            {name} ×
          </button>
        ))}
        <input
          id={`${id}-tag`}
          className="ops__taginput"
          list={unused.length ? `${id}-list` : undefined}
          value={draft}
          placeholder="Add tag"
          title="Type a tag and press Enter"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== ",") return;
            event.preventDefault();
            commit();
          }}
        />
        {unused.length ? (
          <datalist id={`${id}-list`}>
            {unused.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        ) : null}
      </div>
    </div>
  );
}

const MARK = {
  new: { tone: "info", label: "New" },
  replace: { tone: "info", label: "Replacement" },
  remove: { tone: "bad", label: "Will be deleted" },
};

// One file in the editor, in its saved or staged state.
function FileRow({ art, href, name, size, flags, onFlags, mark, children }) {
  const label = mark ? MARK[mark] : null;
  return (
    <div className="frow" data-mark={mark || undefined}>
      {href ? (
        <a className="frow__art" href={href} target="_blank" rel="noreferrer" title="Open in a new tab">
          {art}
        </a>
      ) : (
        <span className="frow__art">{art}</span>
      )}
      <div className="frow__main">
        <span className="frow__name">
          <span className="frow__file">{name}</span>
          {size ? <small>{size}</small> : null}
          {label ? <Status tone={label.tone}>{label.label}</Status> : null}
        </span>
        {flags ? <FlagChips value={flags} onChange={onFlags} disabled={mark === "remove"} /> : null}
      </div>
      <div className="frow__actions">{children}</div>
    </div>
  );
}

function ArtOf({ src, file }) {
  if (src && isImage(file)) return <img src={src} alt="" loading="lazy" />;
  return <span className="frow__ext">{extOf(file.name)}</span>;
}

function LocalArt({ file }) {
  const url = useObjectUrl(isImage(file) ? file : null);
  return <ArtOf src={url} file={file} />;
}

function Editor({ work, tiers, limits, allTags, reload, onClose }) {
  const toast = useToast();
  const { thumb, full, extras } = filesOf(work);
  const [form, setForm] = useState(() => detailsOf(work));
  const [published, setPublished] = useState(Boolean(work.published));
  const [tags, setTags] = useState(() => work.tags || []);
  const [flags, setFlags] = useState({});
  const [removed, setRemoved] = useState([]);
  const [replaced, setReplaced] = useState({});
  const [added, setAdded] = useState([]);
  const [picture, setPicture] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [studio, setStudio] = useState(false);
  const [ask, confirmDialog] = useConfirm();

  const flagFor = (file) => flags[file.id] ?? flagsOf(file);
  const setFlagFor = (file) => (next) => setFlags((current) => ({ ...current, [file.id]: next }));
  const isRemoved = (file) => removed.includes(file.id);
  const toggleRemoved = (file) =>
    setRemoved((current) => (current.includes(file.id) ? current.filter((id) => id !== file.id) : [...current, file.id]));
  const undoReplace = (file) => setReplaced(({ [file.id]: _undo, ...rest }) => rest);

  const savedTags = work.tags || [];
  const detailsDirty = !sameDetails(form, detailsOf(work)) || published !== Boolean(work.published);
  const tagsDirty = tags.length !== savedTags.length || tags.some((tag) => !savedTags.includes(tag));
  const changedFlags = work.files.filter(
    (file) => flags[file.id] && !sameFlags(flags[file.id], flagsOf(file)) && !isRemoved(file)
  );
  const dirty =
    detailsDirty ||
    tagsDirty ||
    changedFlags.length > 0 ||
    removed.length > 0 ||
    Object.keys(replaced).length > 0 ||
    added.length > 0 ||
    Boolean(picture);
  const [requestClose, discardDialog] = useDiscardGuard(dirty, onClose);

  const tooBig = (file) => {
    if (file.size <= limits.file) return false;
    setError(`${file.name} is over ${mb(limits.file)} MB.`);
    return true;
  };

  // Everything in the dialog waits for Save. Each step that finishes is cleared from the
  // staged changes, so if one fails the rest stay waiting and Save picks up where it stopped.
  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setError(null);
    const warnings = [];
    const uploads = [
      ...(picture ? [{ kind: "picture", file: picture }] : []),
      ...Object.entries(replaced).map(([id, file]) => ({ kind: "replace", id, file })),
      ...added.map((item) => ({ kind: "add", item, file: item.file })),
    ];
    try {
      if (detailsDirty) {
        setProgress({ text: "Saving details…" });
        const result = await ops(`gallery/${work.id}`, { method: "PUT", body: bodyOf(form, published) });
        if (result?.warning) warnings.push(result.warning);
      }
      for (const tag of tags.filter((tag) => !savedTags.includes(tag))) {
        await ops(`gallery/${work.id}/tags`, { method: "POST", body: { tag } });
      }
      for (const tag of savedTags.filter((tag) => !tags.includes(tag))) {
        await ops(`gallery/${work.id}/tags/${encodeURIComponent(tag)}`, { method: "DELETE" });
      }
      for (const file of changedFlags) {
        if (replaced[file.id]) continue;
        await ops(`gallery/${work.id}/files/${file.id}`, { method: "PATCH", body: flags[file.id] });
      }
      for (const [index, upload] of uploads.entries()) {
        const step = (share) =>
          setProgress({ text: `Uploading ${upload.file.name} (${index + 1} of ${uploads.length})`, value: share });
        step(0);
        if (upload.kind === "picture") {
          // A replacement picture keeps the old one's access settings.
          const keep = full ? flagParams(flagFor(full)) : {};
          const result = await opsUpload(
            `gallery/${work.id}/files`,
            upload.file,
            { slot: "full", name: upload.file.name, ...keep },
            step
          );
          if (result?.warning) warnings.push(result.warning);
          setPicture(null);
        } else if (upload.kind === "replace") {
          const old = extras.find((file) => file.id === upload.id);
          await opsUpload(
            `gallery/${work.id}/files`,
            upload.file,
            { slot: "extra", name: upload.file.name, ...flagParams(old ? flagFor(old) : EXTRA_DEFAULTS) },
            step
          );
          if (old) await ops(`gallery/${work.id}/files/${old.id}`, { method: "DELETE" });
          setReplaced(({ [upload.id]: _done, ...rest }) => rest);
        } else {
          await opsUpload(
            `gallery/${work.id}/files`,
            upload.file,
            { slot: "extra", name: upload.file.name, ...flagParams(upload.item.flags) },
            step
          );
          setAdded((current) => current.filter((item) => item.key !== upload.item.key));
        }
      }
      for (const id of removed) {
        setProgress({ text: "Deleting files…" });
        await ops(`gallery/${work.id}/files/${id}`, { method: "DELETE" });
        setRemoved((current) => current.filter((item) => item !== id));
      }
      const next = await reload();
      const fresh = next?.works.find((item) => item.id === work.id);
      if (fresh) {
        setForm(detailsOf(fresh));
        setPublished(Boolean(fresh.published));
        setTags(fresh.tags || []);
      }
      setFlags({});
      toast.ok(`Saved ${form.title.trim()}.`);
      for (const warning of warnings) toast.warn(warning);
    } catch (err) {
      setError(`Saving stopped: ${err.message} What finished is saved; the rest is still waiting.`);
      await reload();
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const destroy = () =>
    ask({
      title: `Delete “${work.title}”?`,
      body: `The picture, its thumbnail and ${plural(extras.length, "other file")} are removed from storage along with the folder ${work.folder}. This cannot be undone.`,
      label: "Delete picture",
      action: async () => {
        await ops(`gallery/${work.id}`, { method: "DELETE" });
        await reload();
        onClose();
      },
      done: `Deleted ${work.title}.`,
    });

  const remakeThumb = async () => {
    try {
      await ops(`gallery/${work.id}/thumb`, { method: "POST" });
      await reload();
      toast.ok("Thumbnail remade from the picture.");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const pictureChanging = Boolean(picture) || (full ? isRemoved(full) : false);
  const thumbBlocked = pictureChanging ? "Save the picture change first" : null;
  const canAuto = Boolean(full) && full.bytes <= limits.thumbSource;
  const fileCount = extras.length + added.length;

  return (
    <Modal
      className="modal--wide"
      kicker={<span className="ops__folder">{work.folder}</span>}
      title={work.title}
      onClose={requestClose}
      busy={saving}
      footer={
        <>
          <button type="button" className="btn btn--quiet btn--danger-quiet" onClick={destroy} disabled={saving}>
            Delete picture
          </button>
          <span className="modal__spacer" />
          {progress ? (
            <span className="modal__hint" role="status">
              {progress.text}
              {progress.value != null ? ` ${Math.round(progress.value * 100)}%` : ""}
            </span>
          ) : !form.title.trim() ? (
            <Status tone="bad">Needs a title</Status>
          ) : dirty ? (
            <Status tone="warn">Unsaved changes</Status>
          ) : null}
          <button type="button" className="btn btn--quiet" onClick={() => requestClose(false)} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={save} disabled={saving || !dirty || !form.title.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {error ? (
        <p className="ops__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="editor">
        <div className="editor__col">
          <section className="block">
            <div className="block__head">
              <h3>Details</h3>
            </div>
            <DetailsFields form={form} setForm={setForm} tiers={tiers} disabled={saving} />
            <TagEditor tags={tags} onChange={setTags} suggestions={allTags} disabled={saving} />
            <Switch
              label="Visible on the site"
              checked={published}
              on="Visible on the site"
              off="Hidden from the site"
              disabled={saving}
              onChange={setPublished}
            />
          </section>
        </div>

        <div className="editor__col">
          <section className={full || picture ? "block" : "block block--warn"}>
            <div className="block__head">
              <h3>
                Picture
                <Tip
                  text={`The main image: jpg, png, webp, gif or avif, up to ${mb(limits.file)} MB. A new picture under ${mb(limits.thumbSource)} MB gets a fresh thumbnail when saved.`}
                />
              </h3>
              {!full && !picture ? <Status tone="bad">Missing</Status> : null}
            </div>
            {picture ? (
              <FileRow art={<LocalArt file={picture} />} name={picture.name} size={sizeLabel(picture.size)} mark={full ? "replace" : "new"}>
                <button type="button" className="ops__btn ops__btn--small" onClick={() => setPicture(null)} disabled={saving}>
                  Undo
                </button>
              </FileRow>
            ) : full ? (
              <FileRow
                art={<img src={previewUrl(work, full)} alt="" loading="lazy" />}
                href={previewUrl(work, full)}
                name={full.name}
                size={sizeLabel(full.bytes)}
                flags={flagFor(full)}
                onFlags={setFlagFor(full)}
                mark={isRemoved(full) ? "remove" : null}
              >
                {isRemoved(full) ? (
                  <button type="button" className="ops__btn ops__btn--small" onClick={() => toggleRemoved(full)} disabled={saving}>
                    Undo
                  </button>
                ) : (
                  <>
                    <FileButton
                      label="Replace"
                      accept={IMAGE_TYPES}
                      disabled={saving}
                      onFile={(file) => {
                        if (!tooBig(file)) setPicture(file);
                      }}
                    />
                    <button
                      type="button"
                      className="ops__btn ops__btn--small ops__btn--danger"
                      onClick={() => toggleRemoved(full)}
                      disabled={saving}
                    >
                      Delete
                    </button>
                  </>
                )}
              </FileRow>
            ) : (
              <Dropzone
                compact
                label="Drop the picture here or click to choose"
                accept={IMAGE_TYPES}
                disabled={saving}
                onFiles={(files) => {
                  if (!tooBig(files[0])) setPicture(files[0]);
                }}
              />
            )}
          </section>

          <section className={full && !thumb && !pictureChanging ? "block block--warn" : "block"}>
            <div className="block__head">
              <h3>
                Thumbnail
                <Tip text="Shown in the gallery grid, and as the teaser when the picture is locked. Studio and Make automatically replace it straight away." />
              </h3>
              {full && !thumb && !pictureChanging ? <Status tone="bad">Missing</Status> : null}
            </div>
            {thumb || full ? (
              <FileRow
                art={thumb ? <img src={previewUrl(work, thumb)} alt="" /> : <span className="frow__ext">None</span>}
                name={thumb ? thumb.name : "No thumbnail yet"}
                size={thumb ? sizeLabel(thumb.bytes) : null}
                flags={thumb ? flagFor(thumb) : null}
                onFlags={thumb ? setFlagFor(thumb) : undefined}
              >
                <button
                  type="button"
                  className="ops__btn ops__btn--small"
                  disabled={saving || !full || Boolean(thumbBlocked)}
                  title={thumbBlocked || "Crop the thumbnail from the picture"}
                  onClick={() => setStudio(true)}
                >
                  Studio
                </button>
                <ActionButton
                  className="ops__btn ops__btn--small"
                  busyLabel="Making…"
                  disabled={saving || !canAuto || Boolean(thumbBlocked)}
                  title={
                    thumbBlocked ||
                    (canAuto
                      ? "Resize the whole picture into a new thumbnail"
                      : `Only works for pictures under ${mb(limits.thumbSource)} MB`)
                  }
                  onClick={remakeThumb}
                >
                  Make automatically
                </ActionButton>
              </FileRow>
            ) : (
              <p className="ops__muted">None</p>
            )}
          </section>

          <section className="block">
            <div className="block__head">
              <h3>
                Other files
                <Tip text={`Layered files, archives, PDFs or extra images, up to ${mb(limits.file)} MB each.`} />
              </h3>
              <span className="ops__muted">{fileCount ? plural(fileCount, "file") : "None"}</span>
            </div>
            {extras.map((file) => {
              const swap = replaced[file.id];
              const gone = isRemoved(file);
              return (
                <FileRow
                  key={file.id}
                  art={swap ? <LocalArt file={swap} /> : <ArtOf src={previewUrl(work, file)} file={file} />}
                  href={swap ? null : previewUrl(work, file)}
                  name={swap ? swap.name : file.name}
                  size={sizeLabel(swap ? swap.size : file.bytes)}
                  flags={flagFor(file)}
                  onFlags={setFlagFor(file)}
                  mark={gone ? "remove" : swap ? "replace" : null}
                >
                  {gone || swap ? (
                    <button
                      type="button"
                      className="ops__btn ops__btn--small"
                      disabled={saving}
                      onClick={() => (swap ? undoReplace(file) : toggleRemoved(file))}
                    >
                      Undo
                    </button>
                  ) : (
                    <>
                      <FileButton
                        label="Replace"
                        accept={FILE_TYPES}
                        disabled={saving}
                        onFile={(next) => {
                          if (!tooBig(next)) setReplaced((current) => ({ ...current, [file.id]: next }));
                        }}
                      />
                      <button
                        type="button"
                        className="ops__btn ops__btn--small ops__btn--danger"
                        disabled={saving}
                        onClick={() => toggleRemoved(file)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </FileRow>
              );
            })}
            {added.map((item) => (
              <FileRow
                key={item.key}
                art={<LocalArt file={item.file} />}
                name={item.file.name}
                size={sizeLabel(item.file.size)}
                flags={item.flags}
                onFlags={(next) =>
                  setAdded((current) => current.map((entry) => (entry.key === item.key ? { ...entry, flags: next } : entry)))
                }
                mark="new"
              >
                <button
                  type="button"
                  className="ops__btn ops__btn--small"
                  disabled={saving}
                  onClick={() => setAdded((current) => current.filter((entry) => entry.key !== item.key))}
                >
                  Undo
                </button>
              </FileRow>
            ))}
            <Dropzone
              compact
              label="Add files"
              hint="Drop here or click to choose"
              accept={FILE_TYPES}
              multiple
              disabled={saving}
              onFiles={(files) => {
                const fits = files.filter((file) => !tooBig(file));
                setAdded((current) => [
                  ...current,
                  ...fits.map((file) => ({ key: crypto.randomUUID(), file, flags: { ...EXTRA_DEFAULTS } })),
                ]);
              }}
            />
          </section>
        </div>
      </div>
      {studio && full ? (
        <ThumbStudio
          work={work}
          full={full}
          thumb={thumb}
          limits={limits}
          onClose={() => setStudio(false)}
          upload={async (file, onProgress) => {
            const data = await opsUpload(`gallery/${work.id}/files`, file, { slot: "thumb", name: file.name }, onProgress);
            await reload();
            return data;
          }}
          remake={async () => {
            const data = await ops(`gallery/${work.id}/thumb`, { method: "POST" });
            await reload();
            return data;
          }}
        />
      ) : null}
      {discardDialog}
      {confirmDialog}
    </Modal>
  );
}

function NewPicture({ tiers, limits, allTags, reload, onClose, onCreated }) {
  const [form, setForm] = useState(blankDetails);
  const [published, setPublished] = useState(false);
  const [tags, setTags] = useState([]);
  const [file, setFile] = useState(null);
  const [stage, setStage] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [createdId, setCreatedId] = useState(null);
  const formId = useId();
  const preview = useObjectUrl(file);
  const dirty = Boolean(file || form.title.trim() || form.description.trim() || tags.length);
  const [requestDiscard, discardDialog] = useDiscardGuard(dirty, onClose);

  const pick = (files) => {
    const next = files[0];
    if (!next) return;
    if (next.size > limits.file) {
      setError(`Pictures must be under ${mb(limits.file)} MB.`);
      return;
    }
    setError(null);
    setFile(next);
    setForm((current) => (current.title.trim() ? current : { ...current, title: titleFromFile(next.name) }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    let id = createdId;
    try {
      if (!id) {
        setStage("create");
        const result = await ops("gallery", { method: "POST", body: { ...bodyOf(form, published), tags } });
        id = result.work.id;
        setCreatedId(id);
      }
      if (file) {
        setStage("upload");
        setProgress(0);
        await opsUpload(`gallery/${id}/files`, file, { slot: "full", name: file.name }, setProgress);
      }
      await reload();
      onCreated(id);
    } catch (err) {
      setError(err.message);
      setStage(null);
      setProgress(null);
      await reload();
    }
  };

  // Once the picture exists, closing opens it rather than discarding anything.
  const requestClose = (forced) => {
    if (createdId) onCreated(createdId);
    else requestDiscard(forced);
  };

  const label =
    stage === "create"
      ? "Creating…"
      : stage === "upload"
        ? `Uploading… ${Math.round((progress || 0) * 100)}%`
        : createdId
          ? "Retry the upload"
          : "Create";

  return (
    <Modal
      title="New picture"
      onClose={requestClose}
      busy={Boolean(stage)}
      footer={
        <>
          {createdId ? (
            <button type="button" className="btn btn--quiet" onClick={() => onCreated(createdId)} disabled={Boolean(stage)}>
              Continue without the picture
            </button>
          ) : (
            <button type="button" className="btn btn--quiet" onClick={() => requestClose(false)} disabled={Boolean(stage)}>
              Cancel
            </button>
          )}
          <button type="submit" form={formId} className="btn" disabled={Boolean(stage) || !form.title.trim()}>
            {label}
          </button>
        </>
      }
    >
      <form id={formId} className="ops__form" onSubmit={submit}>
        {error ? (
          <p className="ops__error" role="alert">
            {error}
          </p>
        ) : null}
        <Dropzone
          label={file ? file.name : "Drop the picture here or click to choose"}
          hint={file ? sizeLabel(file.size) : `jpg, png, webp, gif or avif · up to ${mb(limits.file)} MB`}
          accept={IMAGE_TYPES}
          onFiles={pick}
          preview={preview}
          disabled={Boolean(stage)}
          progress={stage === "upload" ? progress : null}
        />
        <DetailsFields form={form} setForm={setForm} tiers={tiers} disabled={Boolean(stage) || Boolean(createdId)} />
        <TagEditor tags={tags} onChange={setTags} suggestions={allTags} disabled={Boolean(stage) || Boolean(createdId)} />
        <Switch
          label="Visible on the site"
          checked={published}
          on="Visible on the site"
          off="Hidden from the site"
          disabled={Boolean(stage) || Boolean(createdId)}
          onChange={setPublished}
        />
      </form>
      {discardDialog}
    </Modal>
  );
}

function WorkCard({ work, tiers, onOpen }) {
  const { thumb, full } = filesOf(work);
  const issues = issuesOf(work);
  const tier = tierName(tiers, work.minCents);
  const tags = work.tags || [];
  return (
    <button type="button" className={work.published ? "gallery-card" : "gallery-card is-hidden"} onClick={onOpen}>
      <span className="gallery-card__art">
        {thumb ? <img src={previewUrl(work, thumb)} alt="" loading="lazy" /> : <span>{full ? "No thumbnail" : "No picture"}</span>}
      </span>
      <strong>{work.title}</strong>
      <span className="chips">
        <span className="chip">{work.rating.toUpperCase()}</span>
        {!work.published ? <span className="chip">Hidden</span> : null}
        {tier ? <span className="chip chip--hot">{tier}</span> : work.patronsOnly ? <span className="chip chip--hot">Patrons</span> : null}
        {issues.map((issue) => (
          <span key={issue} className="chip chip--warn">
            {issue}
          </span>
        ))}
        {tags.slice(0, 2).map((tag) => (
          <span key={tag} className="chip chip--tag">
            #{tag}
          </span>
        ))}
        {tags.length > 2 ? <span className="chip chip--tag">+{tags.length - 2}</span> : null}
      </span>
    </button>
  );
}

function PatreonLine({ patreon, tiers, live, onConnect, onRefresh, onDisconnect }) {
  if (!patreon) return null;
  if (!patreon.configured) {
    return (
      <span className="ops__pair">
        <Status tone="off">Patreon not set up</Status>
        <Tip text="Set the Patreon client id and secret on the worker to lock pictures to tiers." />
      </span>
    );
  }
  if (!patreon.connected) {
    return (
      <span className="ops__pair">
        <Status tone="off">Patreon not connected</Status>
        <button
          type="button"
          className="ops__btn ops__btn--small"
          onClick={onConnect}
          disabled={!live}
          title={live ? "Connect to lock pictures to tiers" : "Set VITE_PATREON_CLIENT_ID in the site build to enable this"}
        >
          Connect
        </button>
      </span>
    );
  }
  return (
    <span className="ops__pair">
      <Status tone="ok">
        {plural(tiers.length, "tier")} from {patreon.campaign || "Patreon"}
      </Status>
      <ActionButton className="ops__btn ops__btn--small" busyLabel="Refreshing…" onClick={onRefresh}>
        Refresh tiers
      </ActionButton>
      <button type="button" className="ops__btn ops__btn--small" onClick={onDisconnect}>
        Disconnect
      </button>
    </span>
  );
}

export function GalleryTab() {
  const { data, error, run, reload, send } = useOps("gallery");
  const patreonLive = usePatreonLive();
  useCreatorReturn(run);
  const [query, setQuery] = useState("");
  const [site, setSite] = useState("all");
  const [state, setState] = useState("all");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [ask, confirmDialog] = useConfirm();

  const works = data?.works ?? [];
  const tiers = data?.tiers ?? [];
  const patreon = data?.patreon;
  const limits = data?.limits ?? DEFAULT_LIMITS;
  const allTags = useMemo(() => [...new Set(works.flatMap((work) => work.tags || []))].sort(), [works]);
  const needle = query.trim().toLowerCase();
  const shown = works.filter((work) => {
    if (site !== "all" && work.rating !== site) return false;
    if (state === "visible" && !work.published) return false;
    if (state === "hidden" && work.published) return false;
    if (state === "issues" && !issuesOf(work).length) return false;
    if (!needle) return true;
    return work.title.toLowerCase().includes(needle) || (work.tags || []).some((tag) => tag.includes(needle));
  });
  const active = works.find((work) => work.id === editing) || null;
  const attention = works.filter((work) => issuesOf(work).length).length;

  const disconnect = () =>
    ask({
      title: "Disconnect the Patreon campaign?",
      body: "Tier names stop updating until it is connected again. Pictures keep their current tier locks.",
      label: "Disconnect",
      action: () => send(() => ops("gallery/patreon", { method: "DELETE" })),
      done: "Patreon disconnected.",
    });

  return (
    <section className="panel ops__section">
      <SectionHead
        title="Pictures"
        count={data ? (shown.length === works.length ? works.length : `${shown.length} of ${works.length}`) : null}
      >
        <PatreonLine
          patreon={patreon}
          tiers={tiers}
          live={patreonLive}
          onConnect={() => beginCreatorConnect("gallery")}
          onRefresh={() => run(() => ops("gallery/tiers", { method: "POST" }), { ok: "Tiers refreshed from Patreon." })}
          onDisconnect={disconnect}
        />
        <button type="button" className="btn btn--small" onClick={() => setCreating(true)}>
          New picture
        </button>
      </SectionHead>
      <div className="ops__filters">
        <input
          className="gallery-find"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Find a picture"
          placeholder="Search title or tag"
        />
        <Segmented label="Site" value={site} onChange={setSite} options={SITE_FILTERS} />
        <Segmented
          label="Status"
          value={state}
          onChange={setState}
          options={[
            { value: "all", label: "Any" },
            { value: "visible", label: "Visible" },
            { value: "hidden", label: "Hidden" },
            { value: "issues", label: "Needs attention", count: attention || null },
          ]}
        />
      </div>
      <Notice error={error} loading={!data && !error} />
      {data && works.length === 0 ? <Empty>No pictures yet.</Empty> : null}
      {data && works.length > 0 && shown.length === 0 ? <Empty>Nothing matches these filters.</Empty> : null}
      {shown.length ? (
        <div className="gallery-grid">
          {shown.map((work) => (
            <WorkCard key={work.id} work={work} tiers={tiers} onOpen={() => setEditing(work.id)} />
          ))}
        </div>
      ) : null}

      {creating ? (
        <NewPicture
          tiers={tiers}
          limits={limits}
          allTags={allTags}
          reload={reload}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setEditing(id);
          }}
        />
      ) : null}
      {active ? (
        <Editor
          key={active.id}
          work={active}
          tiers={tiers}
          limits={limits}
          allTags={allTags}
          reload={reload}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {confirmDialog}
    </section>
  );
}
