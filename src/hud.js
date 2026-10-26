const DEGREES_PER_SECOND = 0.25;

export function headingAt(ms) {
  return ((ms / 1000) * DEGREES_PER_SECOND) % 360;
}

export function bearing(deg, digits = 0) {
  const d = ((deg % 360) + 360) % 360;
  return d.toFixed(digits).padStart(digits ? 4 + digits : 3, "0");
}
