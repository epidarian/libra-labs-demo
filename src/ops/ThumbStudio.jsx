import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal.jsx";
import { Tip } from "./ui.jsx";

const SHAPES = [
  { id: "tile", label: "Gallery tile", ratio: 5 / 4, hint: "The shape pictures take in the gallery grid." },
  { id: "square", label: "Square", ratio: 1, hint: "Fits the compact directory. The grid trims the sides a little." },
  { id: "portrait", label: "Portrait", ratio: 4 / 5, hint: "A tall crop. The grid trims the top and bottom." },
  { id: "whole", label: "Whole picture", ratio: null, hint: "No crop. The grid trims whatever does not fit its tiles." },
];
const OUTPUT_WIDTH = 960;
const MAX_ZOOM = 6;
const PREVIEW_WIDTH = 320;
const IMAGE_TYPES = ".jpg,.jpeg,.png,.webp,.gif,.avif";

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function sizeFor(image, shape, zoom) {
  if (!shape.ratio) return { w: 1, h: 1 };
  const base = Math.min(image.width, image.height * shape.ratio);
  return { w: base / zoom / image.width, h: base / shape.ratio / zoom / image.height };
}

function boxFor(image, shape, zoom, center) {
  const size = sizeFor(image, shape, zoom);
  return {
    x: clamp(center.x - size.w / 2, 0, 1 - size.w),
    y: clamp(center.y - size.h / 2, 0, 1 - size.h),
    w: size.w,
    h: size.h,
  };
}

function encode(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (webp) => {
        if (webp && webp.type === "image/webp") return resolve(webp);
        canvas.toBlob(
          (jpeg) => (jpeg ? resolve(jpeg) : reject(new Error("This browser could not encode the thumbnail."))),
          "image/jpeg",
          0.9
        );
      },
      "image/webp",
      0.86
    );
  });
}

export function ThumbStudio({ work, full, thumb, limits, onClose, upload, remake }) {
  const src = `/api/ops/gallery/${work.id}/files/${full.id}`;
  const [image, setImage] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [shapeId, setShapeId] = useState("tile");
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0.5, y: 0.5 });
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const frameRef = useRef(null);
  const boxRef = useRef(null);
  const previewRef = useRef(null);
  const drag = useRef(null);

  const shape = SHAPES.find((item) => item.id === shapeId) || SHAPES[0];
  const box = image ? boxFor(image, shape, zoom, center) : null;
  const sourceMax = limits?.thumbSource ?? 20 * 1024 * 1024;
  const canAuto = full.bytes <= sourceMax;

  useEffect(() => {
    const el = new Image();
    el.onload = () => setImage({ el, width: el.naturalWidth, height: el.naturalHeight });
    el.onerror = () => setLoadError("The picture could not be loaded into the studio.");
    el.src = src;
    return () => {
      el.onload = null;
      el.onerror = null;
    };
  }, [src]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || !image) return undefined;
    const update = () => setDisp({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [image]);

  // Wheel zoom needs a non-passive listener so the dialog does not scroll instead.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !image) return undefined;
    const onWheel = (event) => {
      if (!shape.ratio) return;
      event.preventDefault();
      setZoom((z) => clamp(z * Math.exp(-event.deltaY * 0.0015), 1, MAX_ZOOM));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [image, shape.ratio]);

  // Keep the centre inside the picture when the frame grows or shrinks.
  useEffect(() => {
    if (!image) return;
    const size = sizeFor(image, shape, zoom);
    setCenter((c) => ({ x: clamp(c.x, size.w / 2, 1 - size.w / 2), y: clamp(c.y, size.h / 2, 1 - size.h / 2) }));
  }, [image, shape, zoom]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !image || !box) return;
    const sw = box.w * image.width;
    const sh = box.h * image.height;
    const pw = PREVIEW_WIDTH;
    const ph = Math.max(1, Math.round((pw * sh) / sw));
    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, pw, ph);
    ctx.drawImage(image.el, box.x * image.width, box.y * image.height, sw, sh, 0, 0, pw, ph);
  }, [image, box?.x, box?.y, box?.w, box?.h]);

  const moveTo = (x, y) => {
    if (!image) return;
    const size = sizeFor(image, shape, zoom);
    setCenter({ x: clamp(x, size.w / 2, 1 - size.w / 2), y: clamp(y, size.h / 2, 1 - size.h / 2) });
  };

  const onPointerDown = (event) => {
    if (!image || !shape.ratio || !disp.w || busy) return;
    event.preventDefault();
    const rect = frameRef.current.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const onBox = Boolean(boxRef.current && boxRef.current.contains(event.target));
    const origin = onBox ? center : { x: px, y: py };
    if (!onBox) moveTo(px, py);
    frameRef.current.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, origin };
    boxRef.current?.focus({ preventScroll: true });
  };
  const onPointerMove = (event) => {
    if (!drag.current || !disp.w) return;
    const dx = (event.clientX - drag.current.x) / disp.w;
    const dy = (event.clientY - drag.current.y) / disp.h;
    moveTo(drag.current.origin.x + dx, drag.current.origin.y + dy);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const onKeyDown = (event) => {
    if (!shape.ratio) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      moveTo(center.x + moves[event.key][0], center.y + moves[event.key][1]);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setZoom((z) => clamp(z * 1.1, 1, MAX_ZOOM));
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      setZoom((z) => clamp(z / 1.1, 1, MAX_ZOOM));
    }
  };

  const pickShape = (id) => {
    setShapeId(id);
    setZoom(1);
    setCenter({ x: 0.5, y: 0.5 });
  };

  const finish = async (kind, task) => {
    setBusy(kind);
    setError(null);
    setProgress(null);
    try {
      await task();
      onClose(true);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const save = () =>
    finish("save", async () => {
      const sw = Math.max(1, Math.round(box.w * image.width));
      const sh = Math.max(1, Math.round(box.h * image.height));
      const ow = Math.min(OUTPUT_WIDTH, sw);
      const oh = Math.max(1, Math.round((sh * ow) / sw));
      const canvas = document.createElement("canvas");
      canvas.width = ow;
      canvas.height = oh;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image.el, box.x * image.width, box.y * image.height, sw, sh, 0, 0, ow, oh);
      const blob = await encode(canvas);
      const file = new File([blob], blob.type === "image/webp" ? "thumbnail.webp" : "thumbnail.jpg", {
        type: blob.type,
      });
      await upload(file, setProgress);
    });

  const useFile = (file) => {
    if (!file) return;
    if (file.size > sourceMax) {
      setError(`Thumbnails must be under ${Math.round(sourceMax / 1048576)} MB.`);
      return;
    }
    finish("file", () => upload(file, setProgress));
  };

  const auto = () => finish("auto", () => remake());

  const status =
    busy === "save" || busy === "file"
      ? progress != null
        ? `Uploading… ${Math.round(progress * 100)}%`
        : "Preparing the thumbnail…"
      : busy === "auto"
        ? "Remaking on the server…"
        : "";

  return (
    <Modal
      className="modal--studio"
      kicker={<span className="ops__folder">{work.folder}</span>}
      title={thumb ? "Thumbnail studio" : "Make a thumbnail"}
      onClose={onClose}
      busy={Boolean(busy)}
      footer={
        <>
          <span className="modal__hint">{status}</span>
          <button type="button" className="btn btn--quiet" onClick={() => onClose(false)} disabled={Boolean(busy)}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={save} disabled={!image || Boolean(busy)}>
            Save thumbnail
          </button>
        </>
      }
    >
      {error ? (
        <p className="ops__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="studio">
        <div className="studio__main">
          <div className="studio__stage">
            {loadError ? <p className="ops__error">{loadError}</p> : null}
            {!image && !loadError ? <p className="ops__muted">Loading the picture…</p> : null}
            {image ? (
              <div
                ref={frameRef}
                className="studio__frame"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <img src={src} alt="" draggable={false} />
                {box ? (
                  <div
                    ref={boxRef}
                    className={shape.ratio ? "studio__crop" : "studio__crop is-whole"}
                    tabIndex={0}
                    role="application"
                    aria-label="Crop frame. Drag to move it. Arrow keys nudge, plus and minus zoom."
                    onKeyDown={onKeyDown}
                    style={{
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.w * 100}%`,
                      height: `${box.h * 100}%`,
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="studio__controls">
            <div className="ops__filters" role="group" aria-label="Shape">
              {SHAPES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="ops__btn"
                  aria-pressed={item.id === shapeId}
                  title={item.hint}
                  onClick={() => pickShape(item.id)}
                  disabled={!image}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="studio__zoom">
              <span className="ops__pair">
                Zoom
                <Tip text="Drag the frame, or press anywhere on the picture to move it there. Scroll, use the slider, or press + and − to zoom." />
              </span>
              <input
                type="range"
                min="1"
                max={MAX_ZOOM}
                step="0.01"
                value={zoom}
                disabled={!shape.ratio || !image}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
          </div>
        </div>
        <aside className="studio__side">
          <div className="studio__panel">
            <h3 className="studio__label">Preview</h3>
            <canvas ref={previewRef} className="studio__preview" width={PREVIEW_WIDTH} height={PREVIEW_WIDTH * 0.8} />
            {image && box ? (
              <p className="ops__muted">
                {Math.round(box.w * image.width)} × {Math.round(box.h * image.height)} px of {image.width} ×{" "}
                {image.height}
              </p>
            ) : null}
          </div>
          <div className="studio__panel">
            <h3 className="studio__label">Other ways</h3>
            <div className="ops__actions">
              <button
                type="button"
                className="ops__btn"
                onClick={auto}
                disabled={!canAuto || Boolean(busy)}
                title={
                  canAuto
                    ? "Resize the whole picture on the server"
                    : `Only works for pictures under ${Math.round(sourceMax / 1048576)} MB. Crop this one here instead.`
                }
              >
                Make automatically
              </button>
              <label className={busy ? "ops__btn file-btn is-disabled" : "ops__btn file-btn"}>
                Upload a file
                <input
                  type="file"
                  accept={IMAGE_TYPES}
                  disabled={Boolean(busy)}
                  onChange={(event) => {
                    useFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
          {progress != null ? (
            <div
              className="progress"
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          ) : null}
        </aside>
      </div>
    </Modal>
  );
}
