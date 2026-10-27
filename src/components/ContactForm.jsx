import { useEffect, useId, useState } from "react";

const COMMISSION = "Commission";

export function ContactForm({ email, open, zone }) {
  const id = useId();
  const [reason, setReason] = useState(open ? COMMISSION : "Order question");
  const [sent, setSent] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open && reason === COMMISSION) setReason("Order question");
  }, [open, reason]);

  async function sendCommission(form, data) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          size: data.get("size"),
          deadline: data.get("deadline"),
          venue: data.get("venue"),
          message: data.get("message"),
          rating: zone,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The request could not be sent.");
      form.reset();
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
      sendCommission(form, data);
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
