import { useId, useState } from "react";

export function sizeLabel(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Progress({ value, label }) {
  return (
    <div className="progress-row">
      {label ? <span className="ops__muted">{label}</span> : null}
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function Dropzone({
  label,
  hint,
  accept,
  multiple = false,
  onFiles,
  disabled = false,
  progress = null,
  progressLabel,
  preview,
  compact = false,
}) {
  const [over, setOver] = useState(false);
  const id = useId();
  const take = (list) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    onFiles(multiple ? files : files.slice(0, 1));
  };
  const busy = progress != null;
  return (
    <label
      className={`drop${compact ? " drop--compact" : ""}${over ? " is-over" : ""}${busy || disabled ? " is-busy" : ""}`}
      htmlFor={id}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled && !busy) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (!disabled && !busy) take(event.dataTransfer.files);
      }}
    >
      <input
        id={id}
        className="drop__input"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled || busy}
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
      {preview ? <img className="drop__preview" src={preview} alt="" /> : null}
      <span className="drop__text">
        {busy ? (
          <>
            <strong>{progressLabel || `Uploading… ${Math.round(progress * 100)}%`}</strong>
            <span className="progress">
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </span>
          </>
        ) : (
          <>
            <strong>{label}</strong>
            {hint ? <span>{hint}</span> : null}
          </>
        )}
      </span>
    </label>
  );
}

export function FileButton({ label, accept, onFile, danger = false, disabled = false }) {
  return (
    <label className={`ops__btn ops__btn--small file-btn${danger ? " ops__btn--danger" : ""}${disabled ? " is-disabled" : ""}`}>
      {label}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
