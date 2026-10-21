const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Santiago',
});

export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}
