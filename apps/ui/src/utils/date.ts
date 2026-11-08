const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Santiago",
});

export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

const calendarFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function santiagoDate(date = new Date()): string {
  const parts = calendarFormatter.formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
