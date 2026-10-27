export function ModeSwitch({ on, onToggle, offLabel, onLabel, kind, disabled = false }) {
  const active = on ? onLabel : offLabel;
  const name = kind === "rating" ? "Work" : kind === "queue" ? "Commission type" : "Light";
  return (
    <button
      type="button"
      className={`switch switch--${kind}`}
      data-on={on ? "true" : "false"}
      aria-pressed={on}
      aria-label={`${name}: ${active}`}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="switch__thumb" aria-hidden="true" />
      <span className={`switch__label ${on ? "" : "is-active"}`} aria-hidden="true">
        {offLabel}
      </span>
      <span className={`switch__label ${on ? "is-active" : ""}`} aria-hidden="true">
        {onLabel}
      </span>
    </button>
  );
}
