import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

/* Toasts: the result of every page-level action. Dialogs show their own errors inline. */

const ToastContext = createContext(null);
const FALLBACK_TOAST = {
  ok: () => {},
  warn: (text) => console.warn(text),
  error: (text) => console.error(text),
};
const TOAST_MS = 5000;
let toastSeq = 0;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (kind, text) => {
      if (!text) return;
      toastSeq += 1;
      const id = toastSeq;
      setItems((current) => [...current.slice(-3), { id, kind, text: String(text) }]);
      // Errors stay until they are dismissed so they cannot be missed.
      if (kind !== "error") timers.current.set(id, setTimeout(() => dismiss(id), TOAST_MS));
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      ok: (text) => push("ok", text),
      warn: (text) => push("warn", text),
      error: (text) => push("error", text),
    }),
    [push]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications">
        {items.map((item) => (
          <div key={item.id} className="toast" data-kind={item.kind} role={item.kind === "error" ? "alert" : "status"}>
            <span className="toast__text">{item.text}</span>
            <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => dismiss(item.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext) || FALLBACK_TOAST;
}

/* Unsaved work: forms register here so leaving a tab or the page can ask first. */

const dirtyForms = new Map();

export function useDirty(dirty, label) {
  const id = useId();
  useEffect(() => {
    if (!dirty) return undefined;
    dirtyForms.set(id, label);
    return () => {
      dirtyForms.delete(id);
    };
  }, [dirty, id, label]);
}

export function dirtyLabels() {
  return [...new Set(dirtyForms.values())];
}

export function useLeaveGuard() {
  useEffect(() => {
    const warn = (event) => {
      if (!dirtyForms.size) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
}

function useAlive() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}

/* A button for one async action. It disables itself and says what it is doing. */

export function ActionButton({
  onClick,
  busyLabel = "Working…",
  className = "ops__btn",
  disabled = false,
  children,
  ...rest
}) {
  const [busy, setBusy] = useState(false);
  const alive = useAlive();
  const click = async (event) => {
    if (busy) return;
    setBusy(true);
    try {
      await onClick(event);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <button
      type="button"
      className={className}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={click}
      {...rest}
    >
      {busy ? busyLabel : children}
    </button>
  );
}

/**
 * Help that stays out of the way: a small mark that shows its text on hover or focus.
 * The bubble is a popover so it is never clipped by a scrolling table or a dialog.
 */
export function Tip({ text }) {
  const id = useId();
  const anchor = useRef(null);
  const bubble = useRef(null);

  const show = () => {
    const el = bubble.current;
    const at = anchor.current;
    if (!el || !at) return;
    try {
      if (!el.matches(":popover-open")) el.showPopover();
    } catch {
      return;
    }
    const rect = at.getBoundingClientRect();
    const left = rect.left + rect.width / 2 - el.offsetWidth / 2;
    const above = rect.top - el.offsetHeight - 8;
    el.style.left = `${Math.min(Math.max(8, left), window.innerWidth - el.offsetWidth - 8)}px`;
    el.style.top = `${above >= 8 ? above : rect.bottom + 8}px`;
  };
  const hide = () => {
    try {
      bubble.current?.hidePopover();
    } catch {
      /* already closed, or popovers are not supported */
    }
  };

  return (
    <span className="tip">
      <button
        type="button"
        ref={anchor}
        className="tip__mark"
        aria-label="Help"
        aria-describedby={id}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(event) => {
          if (event.key === "Escape") hide();
        }}
      >
        ?
      </button>
      <span ref={bubble} id={id} role="tooltip" popover="manual" className="tip__bubble">
        {text}
      </span>
    </span>
  );
}

export function SectionHead({ title, count, help, level = 2, children }) {
  const Tag = `h${level}`;
  return (
    <header className="ops-head">
      <Tag className="ops-head__title">
        {title}
        {count != null ? <span className="ops-head__count">{count}</span> : null}
        {help ? <Tip text={help} /> : null}
      </Tag>
      {children ? <div className="ops__actions">{children}</div> : null}
    </header>
  );
}

/* A labelled control. `children` is a function so the label and error stay wired to the input. */

export function Field({ label, help, error, className = "", children }) {
  const id = useId();
  return (
    <div className={`field ${className}`.trim()} data-invalid={error ? "true" : undefined}>
      <span className="field__top">
        <label htmlFor={id}>{label}</label>
        {help ? <Tip text={help} /> : null}
      </span>
      {children({ id, "aria-describedby": error ? `${id}-error` : undefined, "aria-invalid": error ? true : undefined })}
      {error ? (
        <span className="field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/* One choice out of a few, shown all at once. Arrow keys move the choice. */

export function Segmented({ label, value, onChange, options, disabled = false }) {
  const ref = useRef(null);
  const move = (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const at = options.findIndex((option) => option.value === value);
    const next = options[(at + step + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    ref.current?.querySelector(`[data-value="${CSS.escape(String(next.value))}"]`)?.focus();
  };
  return (
    <div className="seg" role="radiogroup" aria-label={label} ref={ref} onKeyDown={move}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            className="ops__btn"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-value={option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count != null ? <span className="seg__n">{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* An on/off switch that says which state it is in. `label` names it for screen readers. */

export function Switch({ checked, onChange, label, on = "On", off = "Off", disabled = false, title }) {
  return (
    <label className="toggle" data-on={checked ? "true" : "false"} title={title}>
      <input
        type="checkbox"
        role="switch"
        checked={Boolean(checked)}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{checked ? on : off}</span>
    </label>
  );
}

/* A state in words, with a mark, so it never depends on colour alone. */

export function Status({ tone = "off", title, children }) {
  return (
    <span className="status" data-tone={tone} title={title}>
      {children}
    </span>
  );
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

/* Save and discard for a form that saves on demand, with its state beside them. */

export function SaveBar({ dirty, saving, saveLabel = "Save", onSave, onDiscard, blocked, children }) {
  return (
    <div className="savebar">
      <button
        type={onSave ? "button" : "submit"}
        className="btn btn--small"
        disabled={!dirty || saving || Boolean(blocked)}
        onClick={onSave}
      >
        {saving ? "Saving…" : saveLabel}
      </button>
      {onDiscard ? (
        <button type="button" className="ops__btn" disabled={!dirty || saving} onClick={onDiscard}>
          Discard
        </button>
      ) : null}
      <span className="savebar__state" aria-live="polite">
        {blocked ? <Status tone="bad">{blocked}</Status> : dirty ? <Status tone="warn">Unsaved changes</Status> : null}
      </span>
      {children}
    </div>
  );
}

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
