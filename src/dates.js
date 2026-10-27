const format = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const day = (iso) => format.format(new Date(`${iso}T00:00:00Z`));

export function dateRange(start, end) {
  if (!start) return "Dates TBA";
  if (!end || end === start) return day(start);
  return `${day(start)} – ${day(end)}`;
}
