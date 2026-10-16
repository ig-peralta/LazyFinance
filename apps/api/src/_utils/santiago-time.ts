const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function santiagoParts(date: Date) {
  const parts = formatter.formatToParts(date);
  const part = (kind: string) => parts.find((item) => item.type === kind)!.value;
  return {
    year: part('year'), month: part('month'), day: part('day'),
    hour: part('hour'), minute: part('minute'), second: part('second'),
  };
}

export function santiagoMonth(date: Date): string {
  const { year, month } = santiagoParts(date);
  return `${year}-${month}`;
}

export function santiagoTimestamp(date: Date): string {
  const { year, month, day, hour, minute, second } = santiagoParts(date);
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
