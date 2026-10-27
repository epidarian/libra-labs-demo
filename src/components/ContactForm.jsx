import { useId, useState } from "react";
import { CommissionForm } from "./CommissionForm.jsx";

const COMMISSION = "Commission";

export function ContactForm({ email, commissions, zone }) {
  const id = useId();
  const open = commissions.status === "open" && (commissions.queues ?? []).some((q) => q.open);
  const [chosenReason, setReason] = useState(COMMISSION);
  const [sent, setSent] = useState(false);
  const reason = open || chosenReason !== COMMISSION ? chosenReason : "Order question";

  const reasonField = (
    <div className="field">
      <label htmlFor={`${id}-reason`}>Reason</label>
      <select
        id={`${id}-reason`}
        name="reason"
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          setSent(false);
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
  );

  if (reason === COMMISSION) {
    return (
      <div className="panel contact__form">
        <CommissionForm email={email} commissions={commissions} zone={zone} reasonField={reasonField} />
      </div>
    );
  }

  function onSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const lines = [`Name: ${data.get("name")}`, `Email: ${data.get("email")}`];
    lines.push("", String(data.get("message") || ""));
    const subject = `${reason}: ${data.get("name")}`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(lines.join("\n"))}`;
    setSent(true);
  }

  return (
    <div className="panel contact__form">
      <form className="contact__body" onSubmit={onSubmit}>
        {reasonField}
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
    </div>
  );
}
