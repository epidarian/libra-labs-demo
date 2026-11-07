import { useEffect, useState } from "react";
import { usePatreon } from "../context/Patreon.jsx";
import { OPEN_ADDRESS_KEY } from "../patreon.js";

const DISMISS_KEY = "libra-mail-dismissed";
const EMPTY = {
  recipient: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postal_code: "",
  country: "US",
  phone: "",
};

function dismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function useMailAttention() {
  const { profile, isPatron } = usePatreon();
  const [line1, setLine1] = useState(null);

  useEffect(() => {
    if (!isPatron || !profile?.patreonId) {
      setLine1(null);
      return undefined;
    }
    let cancel = false;
    fetch("/api/auth/address")
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((body) => {
        if (!cancel) setLine1(body?.line1 || "");
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [isPatron, profile?.patreonId, profile?.addressStamp]);

  return Boolean(isPatron && profile?.patreonId && line1 === "");
}

export function AddressModal({ open, onClose }) {
  const { profile, isPatron, connect, status } = usePatreon();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const linked = Boolean(profile?.patreonId);
  const viaPatreon = profile && profile.provider !== "email" && profile.provider !== "google";
  const showBind = profile && !linked && !viaPatreon;
  const showInactive = profile && (linked || viaPatreon) && !isPatron;
  const showForm = profile && isPatron && (linked || viaPatreon);

  useEffect(() => {
    if (!open || !showForm) return undefined;
    let cancel = false;
    fetch("/api/auth/address")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not load the address.");
        return body;
      })
      .then((body) => {
        if (!cancel) setForm({ ...EMPTY, ...body, country: body.country || "US" });
      })
      .catch((err) => {
        if (!cancel) setError(err.message);
      });
    return () => {
      cancel = true;
    };
  }, [open, showForm]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/auth/address", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save the address.");
      onClose(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const later = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode */
    }
    onClose();
  };

  return (
    <div className="gate mail-gate" role="presentation" onMouseDown={() => onClose()}>
      <div
        className={`gate__dialog mail-dialog${showBind ? " mail-dialog--bind" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {showBind ? <img className="mail-dialog__ad" src="/patreon_ad.png" alt="" /> : null}
        <div className="mail-dialog__body">
          <p className="gate__kicker">Physical rewards</p>
          <h2 id="mail-title" className="gate__title">
            Mailing address
          </h2>
          {showBind ? (
            <>
              <p>Link Patreon to add a mailing address for physical rewards.</p>
              <button
                type="button"
                className="btn btn--patreon"
                onClick={() => connect({ bind: true })}
                disabled={status === "connecting"}
              >
                {status === "connecting" ? "Connecting…" : "Link Patreon"}
              </button>
            </>
          ) : null}
          {showInactive ? <p>There is nothing to ship right now.</p> : null}
          {showForm ? (
            <form className="ops__form" onSubmit={save}>
              <div className="field-row">
                <Field label="Recipient" value={form.recipient} onChange={set("recipient")} required />
                <Field label="Phone" value={form.phone} onChange={set("phone")} />
              </div>
              <Field label="Street" value={form.line1} onChange={set("line1")} required />
              <Field label="Line 2" value={form.line2} onChange={set("line2")} />
              <div className="field-row">
                <Field label="City" value={form.city} onChange={set("city")} required />
                <Field label="State or region" value={form.region} onChange={set("region")} required />
                <Field label="Postal code" value={form.postal_code} onChange={set("postal_code")} required />
                <Field label="Country" value={form.country} onChange={set("country")} required />
              </div>
              {error ? (
                <p className="drawer__error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="ops__actions">
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? "Saving…" : "Save address"}
                </button>
                <button type="button" className="btn btn--quiet" onClick={later}>
                  Not now
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn--quiet" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, required }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input value={value} onChange={onChange} required={required} />
    </div>
  );
}

export function takeAddressOpen() {
  try {
    const open = sessionStorage.getItem(OPEN_ADDRESS_KEY) === "1";
    if (open) sessionStorage.removeItem(OPEN_ADDRESS_KEY);
    return open;
  } catch {
    return false;
  }
}

export function shouldAutoOpen(needsAddress) {
  return needsAddress && !dismissed();
}
