import { createHash } from 'node:crypto';

function digest(key: string) {
  return createHash('sha256').update(`lazyfinance-demo:${key}`).digest();
}

export function seedId(key: string): string {
  const bytes = digest(key).subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function variedAmount(key: string, minimum: number, maximum: number, step = 500): number {
  return minimum + (digest(key).readUInt32BE(0) % (Math.floor((maximum - minimum) / step) + 1)) * step;
}

export function clp(amount: number): string {
  return amount.toFixed(2);
}

// Midday UTC keeps each booked date in its intended Chilean calendar day.
export function bookedDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay), 15));
}
