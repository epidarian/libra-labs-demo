import { useEffect, useRef } from "react";
import { useSiteMode } from "../context/SiteMode.jsx";
import { bearing, headingAt } from "../hud.js";
import { hash, logLine, readouts, sample, starTag } from "../telemetry.js";

const LOG_EVERY = 6000;
const LOG_LINES = 5;
const TAG_PERIOD = 24000;
const TAG_SLOTS = 3;
const PITCH_SHIFT = 1;
const YAW_SHIFT = 0.15;
const BANK = 6;

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

export function Viewport() {
  const { nsfw } = useSiteMode();
  const starsRef = useRef(null);
  const hudRef = useRef(null);
  const sunRef = useRef(null);
  const moonRef = useRef(null);
  const stripRef = useRef(null);
  const nsfwRef = useRef(nsfw);

  useEffect(() => {
    nsfwRef.current = nsfw;
  }, [nsfw]);

  useEffect(() => {
    const starCanvas = starsRef.current;
    const hudCanvas = hudRef.current;
    const sctx = starCanvas.getContext("2d");
    const hctx = hudCanvas.getContext("2d");
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const stars = Array.from({ length: 280 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random() * 0.85 + 0.15,
      r: Math.random() * 1.1 + 0.25,
      tw: Math.random() * TAU,
    }));
    const pointer = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5 };
    const colors = { hud: "rgba(255, 200, 120, 0.5)", star: "#ffffff" };
    const bounds = { top: 0, bottom: 0 };
    const t0 = performance.now();
    let w = 0;
    let h = 0;
    let raf = 0;
    let frame = 0;
    let slew = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      for (const [canvas, ctx] of [
        [starCanvas, sctx],
        [hudCanvas, hctx],
      ]) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    function readColors() {
      const cs = getComputedStyle(document.documentElement);
      colors.hud = cs.getPropertyValue("--hud").trim() || colors.hud;
      colors.star = cs.getPropertyValue("--star").trim() || colors.star;
      const bar = document.querySelector(".topbar");
      const foot = document.querySelector(".colophon");
      bounds.top = bar ? bar.getBoundingClientRect().bottom : 0;
      bounds.bottom = foot ? Math.min(h, foot.getBoundingClientRect().top) : h;
    }

    function readSlew() {
      const strip = stripRef.current;
      if (!strip || !h) return;
      const ty = new DOMMatrixReadOnly(getComputedStyle(strip).transform).m42;
      slew = Math.max(0, Math.min(1, 1 + ty / h));
    }

    function onMove(event) {
      pointer.x = event.clientX / w;
      pointer.y = event.clientY / h;
    }

    function drawStars(t) {
      sctx.clearRect(0, 0, w, h);
      sctx.fillStyle = colors.star;
      const drift = t * 0.0000035;
      const ox = (pointer.sx - 0.5) * -26;
      const oy = (pointer.sy - 0.5) * -18;
      for (const s of stars) {
        const x = ((((s.x + drift * s.z + slew * YAW_SHIFT * s.z) % 1) + 1) % 1) * w + ox * s.z;
        const y = ((((s.y + slew * PITCH_SHIFT * s.z) % 1) + 1) % 1) * h + oy * s.z;
        s.px = x;
        s.py = y;
        const a = 0.35 + 0.15 * Math.sin(s.tw + t * 0.0003 * s.z) + 0.45 * s.z;
        sctx.globalAlpha = Math.max(0.1, Math.min(1, a));
        sctx.beginPath();
        sctx.arc(x, y, s.r * (0.5 + s.z), 0, TAU);
        sctx.fill();
      }
      sctx.globalAlpha = 1;
    }

    function text(g, value, x, y, align = "center") {
      g.textAlign = align;
      g.fillText(value, x, y);
    }

    const bright = stars
      .map((s, i) => (s.z > 0.75 ? i : -1))
      .filter((i) => i >= 0);

    function drawData(g, t) {
      const gw = 180;
      const gh = 26;
      const left = w - 28 - gw;
      const rows = readouts(t);
      const rowsTop = bounds.top + 36;
      g.globalAlpha = 0.55;
      rows.forEach(([label, value], i) => {
        text(g, label, left, rowsTop + i * 14, "left");
        text(g, value, left + 52, rowsTop + i * 14, "left");
      });

      const gy = rowsTop + rows.length * 14 + 6;
      const step = gw / 120;
      const now = t / 1000;
      const sec = Math.floor(now);
      const frac = now - sec;
      g.globalAlpha = 0.25;
      g.beginPath();
      g.moveTo(left, gy + gh / 2);
      g.lineTo(left + gw, gy + gh / 2);
      g.stroke();
      g.globalAlpha = 0.55;
      g.beginPath();
      for (let i = 0; i <= 120; i += 1) {
        const x = left + gw - (i + frac) * step;
        const y = gy + gh / 2 - sample(sec - i) * (gh / 2);
        if (i === 0) g.moveTo(left + gw, y);
        else g.lineTo(x, y);
      }
      g.stroke();

      const n = Math.floor(t / LOG_EVERY) + 1000;
      const e = Math.min(1, (t % LOG_EVERY) / 1500);
      const ease = e * e * (3 - 2 * e);
      const base = bounds.bottom - 66;
      for (let k = 0; k <= LOG_LINES; k += 1) {
        const pos = k - 1 + ease;
        const a = k === 0 ? ease : 1 - pos / LOG_LINES;
        if (a <= 0) continue;
        g.globalAlpha = 0.5 * a;
        text(g, logLine(n - k), w - 28, base - pos * 14, "right");
      }

      if (!bright.length) return;
      for (let j = 0; j < TAG_SLOTS; j += 1) {
        const shifted = t + (j * TAG_PERIOD) / TAG_SLOTS;
        const cycle = Math.floor(shifted / TAG_PERIOD);
        const phase = (shifted % TAG_PERIOD) / TAG_PERIOD;
        const id = cycle * TAG_SLOTS + j;
        const s = stars[bright[Math.floor(hash(id) * bright.length)]];
        if (s.px == null || s.px < 40 || s.px > w - 160) continue;
        g.globalAlpha = 0.6 * Math.sin(Math.PI * phase) ** 2;
        g.beginPath();
        g.arc(s.px, s.py, 6, 0, TAU);
        g.moveTo(s.px + 5, s.py - 5);
        g.lineTo(s.px + 16, s.py - 16);
        g.lineTo(s.px + 22, s.py - 16);
        g.stroke();
        text(g, starTag(id), s.px + 26, s.py - 16, "left");
      }
    }

    function drawHud(t, now) {
      const g = hctx;
      g.clearRect(0, 0, w, h);
      g.strokeStyle = colors.hud;
      g.fillStyle = colors.hud;
      g.lineWidth = 1;
      g.font = '10px "IBM Plex Mono", monospace';
      g.textBaseline = "middle";

      const cx = w * 0.6 + (pointer.sx - 0.5) * 24;
      const cy = h * 0.5 + (pointer.sy - 0.5) * 16;
      const R = Math.min(w, h) * 0.38;
      const ppd = R / 55;
      const hdg = headingAt(now) - (slew * YAW_SHIFT * w) / ppd;
      const roll = (Math.sin(t * 0.00008) + Math.sin(Math.PI * slew) * BANK) * RAD;
      const pitch = Math.sin(t * 0.00005) * 2 + (slew * PITCH_SHIFT * h) / ppd;

      g.save();
      g.translate(cx, cy);
      g.globalAlpha = 0.5;
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.stroke();
      g.globalAlpha = 0.25;
      g.setLineDash([2, 6]);
      g.beginPath();
      g.arc(0, 0, R * 0.93, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      for (let d = 0; d < 360; d += 2) {
        const a = (d - hdg - 90) * RAD;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const len = d % 30 === 0 ? 16 : d % 10 === 0 ? 10 : 5;
        g.globalAlpha = d % 10 === 0 ? 0.75 : 0.35;
        g.beginPath();
        g.moveTo(c * R, s * R);
        g.lineTo(c * (R - len), s * (R - len));
        g.stroke();
        if (d % 30 === 0) {
          g.globalAlpha = 0.85;
          text(g, bearing(d), c * (R + 16), s * (R + 16));
        }
      }

      g.rotate(roll);
      const first = Math.ceil((pitch - 50) / 10) * 10;
      for (let p = first; p <= pitch + 50; p += 10) {
        const y = -(p - pitch) * ppd;
        if (Math.abs(y) > R * 0.85) continue;
        const half = Math.sqrt(R * R - y * y) * 0.9;
        g.globalAlpha = p === 0 ? 0.6 : 0.4 * (1 - Math.abs(y) / R);
        g.beginPath();
        g.moveTo(-half, y * 0.82);
        g.quadraticCurveTo(0, y * 1.18, half, y * 0.82);
        g.stroke();
      }
      g.restore();

      g.globalAlpha = 0.8;
      g.font = '11px "IBM Plex Mono", monospace';
      text(g, `HDG ${bearing(hdg, 1)}`, w - 28, bounds.bottom - 44, "right");
      text(
        g,
        `TIME ${new Date(now).toLocaleTimeString([], { hour12: false })}`,
        w - 28,
        bounds.bottom - 28,
        "right"
      );
      g.font = '10px "IBM Plex Mono", monospace';
      drawData(g, t);

      const body = nsfwRef.current ? moonRef.current : sunRef.current;
      if (body) {
        const r = body.getBoundingClientRect();
        const bx = r.left + r.width / 2;
        const by = r.top + r.height / 2;
        if (bx > -80 && bx < w + 80 && by > -80 && by < h + 80) {
          const s = r.width * 0.28 + 14;
          const k = 12;
          g.save();
          g.translate(bx, by);
          g.globalAlpha = 0.9;
          g.lineWidth = 1.2;
          for (const [dx, dy] of [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ]) {
            g.beginPath();
            g.moveTo(dx * s, dy * (s - k));
            g.lineTo(dx * s, dy * s);
            g.lineTo(dx * (s - k), dy * s);
            g.stroke();
          }
          const az = hdg + (bx - cx) / ppd;
          const el = (cy - by) / ppd;
          text(g, `AZ ${bearing(az, 1)}`, s + 10, -s + 6, "left");
          text(g, `EL ${el >= 0 ? "+" : "-"}${Math.abs(el).toFixed(1)}`, s + 10, -s + 20, "left");
          g.restore();
        }
      }
    }

    function tick() {
      const elapsed = reduce ? 0 : performance.now() - t0;
      pointer.sx += (pointer.x - pointer.sx) * 0.015;
      pointer.sy += (pointer.y - pointer.sy) * 0.015;
      if (frame % 15 === 0) readColors();
      readSlew();
      drawStars(elapsed);
      drawHud(elapsed, Date.now());
      frame += 1;
      raf = requestAnimationFrame(tick);
    }

    resize();
    readColors();
    tick();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div className="viewport" aria-hidden="true">
      <div className="sky" data-body={nsfw ? "moon" : "sun"}>
        <div ref={stripRef} className="sky__strip">
          <div className="sky__scene sky__scene--moon">
            <div className="nebula" />
            <div ref={moonRef} className="moon" />
          </div>
          <div className="sky__scene sky__scene--sun">
            <div ref={sunRef} className="sun" />
          </div>
        </div>
      </div>
      <canvas ref={starsRef} className="viewport__layer viewport__stars" />
      <canvas ref={hudRef} className="viewport__layer" />
      <div className="viewport__glass" />
    </div>
  );
}
