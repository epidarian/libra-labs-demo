import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "./ui.jsx";

/**
 * A native <dialog> shown modally while mounted. Render it conditionally.
 * onClose(false) is a request (Escape, backdrop, Close button); onClose(true)
 * means the browser already closed it and the parent must unmount it.
 */
export function Modal({ title, kicker, tools, footer, onClose, children, className = "", busy = false }) {
  const ref = useRef(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const first = dialog.querySelector("[data-autofocus]");
    if (first) first.focus();
  }, []);

  const request = () => {
    if (!busy) onClose(false);
  };

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`.trim()}
      aria-label={typeof title === "string" ? title : undefined}
      onCancel={(event) => {
        event.preventDefault();
        request();
      }}
      onClose={() => onClose(true)}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === ref.current;
      }}
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === ref.current) request();
        pressedBackdrop.current = false;
      }}
    >
      <div className="modal__frame">
        <header className="modal__head">
          <div className="modal__heading">
            {kicker ? <div className="modal__kicker">{kicker}</div> : null}
            <h2 className="modal__title">{title}</h2>
          </div>
          <div className="modal__tools">
            {tools}
            <button type="button" className="ops__btn" onClick={request} disabled={busy}>
              Close
            </button>
          </div>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__foot">{footer}</footer> : null}
      </div>
    </dialog>
  );
}

export function Confirm({
  title,
  body,
  label = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  busy = false,
  error = null,
  onConfirm,
  onClose,
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      className="modal--narrow"
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={() => onClose(false)} disabled={busy} data-autofocus>
            {cancelLabel}
          </button>
          <button type="button" className={danger ? "btn btn--danger" : "btn"} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : label}
          </button>
        </>
      }
    >
      {typeof body === "string" ? <p>{body}</p> : body}
      {error ? (
        <p className="ops__error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

/**
 * One confirmation dialog for a component. ask({ title, body, label, danger, action, done })
 * opens it; `action` must throw on failure so the dialog can stay open and show why.
 * `done` is the message shown once it worked.
 */
export function useConfirm() {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const ask = useCallback((options) => {
    setError(null);
    setState(options);
  }, []);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await state.action();
      setState(null);
      const done = typeof state.done === "function" ? state.done(result) : state.done;
      if (done) toast.ok(done);
    } catch (err) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const dialog = state ? (
    <Confirm
      title={state.title}
      body={state.body}
      label={state.label}
      cancelLabel={state.cancelLabel}
      danger={state.danger !== false}
      busy={busy}
      error={error}
      onConfirm={confirm}
      onClose={() => setState(null)}
    />
  ) : null;

  return [ask, dialog];
}

/**
 * Closing a dialog that holds unsaved input asks first.
 * Returns the close handler for <Modal onClose> and the dialog to render inside it.
 */
export function useDiscardGuard(dirty, onClose, body = "The changes you made here have not been saved.") {
  const [asking, setAsking] = useState(false);
  const request = (forced) => {
    if (forced === true || !dirty) onClose();
    else setAsking(true);
  };
  const dialog = asking ? (
    <Confirm
      title="Discard changes?"
      body={body}
      label="Discard"
      cancelLabel="Keep editing"
      onConfirm={onClose}
      onClose={() => setAsking(false)}
    />
  ) : null;
  return [request, dialog];
}
