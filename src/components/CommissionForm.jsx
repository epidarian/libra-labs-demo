import { useId, useMemo, useRef, useState } from "react";
import { MAX_QUANTITY, describeLine, formatCents, priceLabel, quote } from "../commissionPricing.js";
import { ModeSwitch } from "./ModeSwitch.jsx";

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const RIGHTS =
  "I agree that either: all characters are mine, I have permission to use the characters in this " +
  "submission, the character(s) is/are in the public domain, and/or the character is not associated " +
  "with a trademark.";

function depthOf(option, byId) {
  let depth = 0;
  for (let at = option; at?.parent_id; at = byId.get(at.parent_id)) depth += 1;
  return depth;
}

function descendantsOf(id, options) {
  const out = new Set([id]);
  for (const option of options) {
    if (option.parent_id && out.has(option.parent_id)) out.add(option.id);
  }
  out.delete(id);
  return out;
}

function TermsDialog({ dialog, terms, onAgree }) {
  return (
    <dialog ref={dialog} className="terms" aria-labelledby="terms-title">
      <h2 id="terms-title" className="panel__title">Terms of Service</h2>
      <ol className="terms__list">
        {terms.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <p className="terms__copy">
        <a href="/tos.txt">Open the full terms as text</a>
      </p>
      <div className="contact__actions">
        <button type="button" className="btn" onClick={onAgree}>
          I agree
        </button>
        <button type="button" className="btn btn--quiet" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </div>
    </dialog>
  );
}

function OptionControl({ option, depth, picks, chosen, setPick, toggle, id }) {
  const enabled = !option.parent_id || chosen.has(option.parent_id);
  const on = option.required || picks[option.id] != null;
  const inputId = `${id}-opt-${option.id}`;
  return (
    <li className="pricing__option" style={{ "--depth": depth }} data-disabled={enabled ? undefined : "true"}>
      <label className="ops__check" htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          checked={on && enabled}
          disabled={option.required || !enabled}
          onChange={(event) => toggle(option, event.target.checked)}
        />
        {option.label}
      </label>
      {option.quantity_label ? (
        <input
          className="pricing__qty"
          type="number"
          min={1}
          max={MAX_QUANTITY}
          step={1}
          aria-label={`Number of ${option.quantity_label}`}
          disabled={!on || !enabled}
          value={picks[option.id] ?? 1}
          onChange={(event) => setPick(option.id, event.target.value === "" ? "" : Number(event.target.value))}
        />
      ) : null}
      <span className="pricing__price">{priceLabel(option)}</span>
    </li>
  );
}

export function CommissionForm({ email, commissions, zone, reasonField }) {
  const id = useId();
  const dialog = useRef(null);
  const queues = commissions.queues ?? [];
  const terms = commissions.terms ?? { items: [], updated: "" };
  const [pickedQueue, setQueueId] = useState("illustration");
  const queueId = queues.some((q) => q.id === pickedQueue && q.open)
    ? pickedQueue
    : (queues.find((q) => q.id === "illustration" && q.open)?.id ?? queues.find((q) => q.open)?.id ?? "");
  const [picks, setPicks] = useState({});
  const [agreed, setAgreed] = useState(false);
  const [images, setImages] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const queue = queues.find((q) => q.id === queueId) ?? null;
  const options = queue?.options ?? [];
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const priced = useMemo(() => (queue ? quote(options, picks) : null), [queue, options, picks]);
  const chosen = new Set();
  for (const option of options) {
    const on = option.required || picks[option.id] != null;
    if (on && (!option.parent_id || chosen.has(option.parent_id))) chosen.add(option.id);
  }

  function setPick(optionId, qty) {
    setPicks((current) => ({ ...current, [optionId]: qty }));
  }

  function toggle(option, on) {
    setPicks((current) => {
      const next = { ...current };
      if (on) {
        for (let at = option; at; at = at.parent_id ? byId.get(at.parent_id) : null) {
          if (!at.required && next[at.id] == null) next[at.id] = 1;
        }
      } else {
        delete next[option.id];
        for (const child of descendantsOf(option.id, options)) delete next[child];
      }
      return next;
    });
  }

  function addFiles(incoming) {
    const next = [...images];
    let rejected = null;
    for (const file of incoming) {
      if (!IMAGE_TYPES.includes(file.type)) {
        rejected = "Images must be jpeg, png, webp, or gif.";
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        rejected = "Each image must be 8 MB or smaller.";
        continue;
      }
      if (next.length >= MAX_IMAGES) {
        rejected = `Attach up to ${MAX_IMAGES} images.`;
        break;
      }
      next.push(file);
    }
    setImages(next);
    setError(rejected);
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (priced?.error) {
      setError(priced.error);
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    setSending(true);
    setError(null);
    try {
      const payload = new FormData();
      for (const name of ["usernames", "email", "paypal_email", "description"]) {
        payload.set(name, data.get(name) || "");
      }
      payload.set("queue", queueId);
      payload.set("rating", zone);
      payload.set("picks", JSON.stringify(picks));
      payload.set("rights", data.get("rights") ? "1" : "");
      payload.set("terms", agreed ? "1" : "");
      payload.set("terms_version", terms.updated);
      for (const file of images) payload.append("images", file);
      const res = await fetch("/api/commissions", { method: "POST", body: payload });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The request could not be sent.");
      form.reset();
      setPicks({});
      setAgreed(false);
      setImages([]);
      setSent(true);
    } catch (err) {
      setError(`${err.message} You can also write to ${email}.`);
    } finally {
      setSending(false);
    }
  }

  const note =
    error ||
    (sent
      ? "Request received."
      : "All communication about your commission happens by email.");

  const illustration = queues.find((item) => item.id === "illustration");
  const comics = queues.find((item) => item.id === "comics");
  const pair = queues.length === 2 ? (illustration && comics ? [illustration, comics] : queues) : null;
  const other = pair?.find((item) => item.id !== queueId);

  return (
    <form className="contact__body" onSubmit={onSubmit}>
      <div className="contact__head">
        {reasonField}
        {pair ? (
          <ModeSwitch
            kind="queue"
            offLabel={pair[0].name}
            onLabel={pair[1].name}
            on={queueId === pair[1].id}
            disabled={!other?.open}
            onToggle={() => {
              if (!other?.open) return;
              setQueueId(other.id);
              setPicks({});
            }}
          />
        ) : (
          <div className="field">
            <label htmlFor={`${id}-queue`}>Commission type</label>
            <select
              id={`${id}-queue`}
              value={queueId}
              onChange={(event) => {
                setQueueId(event.target.value);
                setPicks({});
              }}
              required
            >
              {queues.map((q) => (
                <option key={q.id} value={q.id} disabled={!q.open}>
                  {q.open ? q.name : `${q.name} (closed)`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {queue ? (
        <fieldset className="field pricing">
          <legend className="panel__title">Options</legend>
          <ul className="pricing__list">
            {options.map((option) => (
              <OptionControl
                key={option.id}
                id={id}
                option={option}
                depth={depthOf(option, byId)}
                picks={picks}
                chosen={chosen}
                setPick={setPick}
                toggle={toggle}
              />
            ))}
          </ul>
          {priced?.error ? (
            <p className="contact__note" role="alert">{priced.error}</p>
          ) : (
            <div className="pricing__quote" aria-live="polite">
              <ul>
                {priced.lines.map((line) => (
                  <li key={line.id}>{describeLine(line)}</li>
                ))}
              </ul>
              <strong>Quoted total: {formatCents(priced.totalCents)}</strong>
            </div>
          )}
        </fieldset>
      ) : null}

      <div className="field-row field-row--2">
        <div className="field">
          <label htmlFor={`${id}-usernames`}>Username(s)</label>
          <input id={`${id}-usernames`} name="usernames" autoComplete="nickname" required />
        </div>
        <div className="field">
          <label htmlFor={`${id}-email`}>Email</label>
          <input id={`${id}-email`} name="email" type="email" autoComplete="email" required />
        </div>
      </div>

      <div className="field field--paypal">
        <label htmlFor={`${id}-paypal`}>PayPal email (if different from above)</label>
        <input id={`${id}-paypal`} name="paypal_email" type="email" autoComplete="off" />
        <span className="dropzone__hint">Commissions are completed by PayPal invoice.</span>
      </div>

      <div className="field">
        <label htmlFor={`${id}-description`}>Detailed description</label>
        <textarea id={`${id}-description`} name="description" rows={6} maxLength={5000} required />
      </div>

      <div className="field">
        <label htmlFor={`${id}-images`}>Reference images (optional)</label>
        <label
          className={`dropzone${dragging ? " dropzone--active" : ""}`}
          htmlFor={`${id}-images`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <input
            id={`${id}-images`}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            multiple
            className="dropzone__input"
            onChange={(event) => {
              addFiles(Array.from(event.target.files));
              event.target.value = "";
            }}
          />
          <span>Drop high-resolution reference images here, or choose files.</span>
          <span className="dropzone__hint">
            jpeg, png, webp, gif. Up to {MAX_IMAGES} images, 8 MB each.
          </span>
        </label>
        {images.length ? (
          <ul className="dropzone__list">
            {images.map((file, index) => (
              <li key={`${file.name}-${index}`} className="dropzone__item">
                <span className="dropzone__name">{file.name}</span>
                <button
                  type="button"
                  className="dropzone__remove"
                  onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Remove ${file.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <label className="ops__check contact__agree">
        <input type="checkbox" name="rights" required />
        {RIGHTS}
      </label>
      <label className="ops__check contact__agree">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          required
        />
        <span>
          I agree to the{" "}
          <button type="button" className="contact__link" onClick={() => dialog.current?.showModal()}>
            Terms of Service
          </button>
        </span>
      </label>

      <div className="contact__actions">
        <button type="submit" className="btn" disabled={sending || !queue?.open}>
          {sending ? "Sending…" : "Send request"}
        </button>
        <p className="contact__note" role={error ? "alert" : undefined} aria-live="polite">
          {note}
        </p>
      </div>

      <TermsDialog
        dialog={dialog}
        terms={terms}
        onAgree={() => {
          setAgreed(true);
          dialog.current?.close();
        }}
      />
    </form>
  );
}
