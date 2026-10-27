import { useEffect, useId, useState } from "react";

const COMMISSION = "Commission";
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function ContactForm({ email, open, zone }) {
  const id = useId();
  const [reason, setReason] = useState(open ? COMMISSION : "Order question");
  const [sent, setSent] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [images, setImages] = useState([]);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open && reason === COMMISSION) setReason("Order question");
  }, [open, reason]);

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

  function removeImage(index) {
    setImages((current) => current.filter((_, i) => i !== index));
  }

  async function sendCommission(form, data, files) {
    setSending(true);
    setError(null);
    try {
      const payload = new FormData();
      payload.set("name", data.get("name") || "");
      payload.set("email", data.get("email") || "");
      payload.set("size", data.get("size") || "");
      payload.set("deadline", data.get("deadline") || "");
      payload.set("venue", data.get("venue") || "");
      payload.set("message", data.get("message") || "");
      payload.set("rating", zone);
      for (const file of files) payload.append("images", file);
      const res = await fetch("/api/commissions", {
        method: "POST",
        body: payload,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The request could not be sent.");
      form.reset();
      setImages([]);
      setSent("request");
    } catch (err) {
      setError(`${err.message} You can also write to ${email}.`);
    } finally {
      setSending(false);
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (reason === COMMISSION) {
      sendCommission(form, data, images);
      return;
    }
    const lines = [`Name: ${data.get("name")}`, `Email: ${data.get("email")}`];
    lines.push("", String(data.get("message") || ""));
    const subject = `${reason}: ${data.get("name")}`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(lines.join("\n"))}`;
    setSent("mail");
  }

  const note =
    error ||
    (sent === "request"
      ? "Request received. A reply will come to the email address you entered."
      : sent === "mail"
        ? `Your email app should now be open with this message. If it is not, write to ${email}.`
        : reason === COMMISSION
          ? "Sends the request to the studio."
          : "Opens your email app with this message filled in.");

  return (
    <form className="panel contact__form" onSubmit={onSubmit}>
      <div className="field-row field-row--2">
        <div className="field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} name="name" autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor={`${id}-email`}>Email</label>
          <input id={`${id}-email`} name="email" type="email" autoComplete="email" required />
        </div>
      </div>

      <div className="field">
        <label htmlFor={`${id}-reason`}>Reason</label>
        <select
          id={`${id}-reason`}
          name="reason"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setSent(null);
            setError(null);
          }}
        >
          <option value={COMMISSION} disabled={!open}>
            {open ? "Commission" : "Commission (closed)"}
          </option>
          <option value="Order question">Order question</option>
          <option value="Convention question">Convention question</option>
          <option value="Other">Other</option>
        </select>
      </div>

      {reason === COMMISSION ? (
        <>
          <div className="field-row">
            <div className="field">
              <label htmlFor={`${id}-size`}>Size</label>
              <input id={`${id}-size`} name="size" placeholder="11×17, phone wallpaper…" />
            </div>
            <div className="field">
              <label htmlFor={`${id}-deadline`}>Deadline</label>
              <input id={`${id}-deadline`} name="deadline" type="date" />
            </div>
            <div className="field">
              <label htmlFor={`${id}-venue`}>Where it will be shown</label>
              <input id={`${id}-venue`} name="venue" placeholder="Personal, print, stream…" />
            </div>
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
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="dropzone__input"
                onChange={(event) => {
                  addFiles(Array.from(event.target.files));
                  event.target.value = "";
                }}
              />
              <span>Drop reference or mood images here, or choose files.</span>
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
                      onClick={() => removeImage(index)}
                      aria-label={`Remove ${file.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="field">
        <label htmlFor={`${id}-message`}>Message</label>
        <textarea id={`${id}-message`} name="message" rows={6} required />
      </div>

      <div className="contact__actions">
        <button type="submit" className="btn" disabled={sending}>
          {sending ? "Sending…" : "Send"}
        </button>
        <p className="contact__note" role={error ? "alert" : undefined} aria-live="polite">
          {note}
        </p>
      </div>
    </form>
  );
}
