export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function wave(ms, seed) {
  return (
    (Math.sin(ms * 0.00011 + seed) +
      0.6 * Math.sin(ms * 0.000037 + seed * 2.3) +
      0.3 * Math.sin(ms * 0.00029 + seed * 5.1)) /
    1.9
  );
}

function pad(n, len) {
  return String(Math.floor(n)).padStart(len, "0");
}

function signed(v, digits) {
  return `${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(digits)}`;
}

export function readouts(ms) {
  const t = Math.floor(ms / 1000) * 1000;
  return [
    ["FLUX", `${(10 ** (-6 + 0.4 * wave(t, 1))).toExponential(2)} W/m2`],
    ["KP", (2.5 + 1.5 * wave(t, 2)).toFixed(2)],
    ["RV", `${signed(-12.8 + 6 * wave(t, 3), 1)} km/s`],
    ["T", `${(2.725 + 0.002 * wave(t, 4)).toFixed(3)} K`],
    ["RANGE", `${(4.118 + t / 3.6e9).toFixed(4)} AU`],
  ];
}

export function sample(second) {
  return 0.7 * wave(second * 1000, 7) + 0.3 * (hash(second) * 2 - 1);
}

export function logLine(n) {
  const id = pad(hash(n) * 4096, 4);
  const rv = signed((hash(n + 0.5) * 2 - 1) * 40, 1);
  const mag = (3 + hash(n + 0.25) * 6).toFixed(1);
  return `${pad(n % 10000, 4)}  S-${id}  RV ${rv}  MAG ${mag}`;
}

export function starTag(n) {
  return `S-${pad(hash(n) * 4096, 4)}  m ${(3 + hash(n + 0.75) * 6).toFixed(1)}`;
}
