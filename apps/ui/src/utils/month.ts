const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
});
const labelFormatter = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'long',
});

export function currentMonth(now = new Date()): string {
  const parts = partsFormatter.formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  return labelFormatter.format(new Date(`${month}-01T12:00:00.000Z`));
}
