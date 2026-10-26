import { useId, useState } from "react";

const COMMISSION = "Commission";

export function ContactForm({ email, open }) {
  const id = useId();
  const [reason, setReason] = useState(open ? COMMISSION : "Order question");
  const [sent, setSent] = useState(false);

  function onSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const lines = [`Name: ${data.get("name")}`, `Email: ${data.get("email")}`];
    if (reason === COMMISSION) {
      lines.push(
        `Size: ${data.get("size") || "-"}`,
        `Deadline: ${data.get("deadline") || "-"}`,
        `Where it will be shown: ${data.get("venue") || "-"}`
      );
    }
    lines.push("", String(data.get("message") || ""));
    const subject = `${reason}: ${data.get("name")}`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(lines.join("\n"))}`;
    setSent(true);
  }

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
          onChange={(event) => setReason(event.target.value)}
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
        <button type="submit" className="btn">
          Send
        </button>
        <p className="contact__note" aria-live="polite">
          {sent
            ? `Your email app should now be open with this message. If it is not, write to ${email}.`
            : "Opens your email app with this message filled in."}
        </p>
      </div>
    </form>
  );
}
