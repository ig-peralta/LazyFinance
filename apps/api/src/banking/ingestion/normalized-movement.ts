import { toCents } from '../../_utils/money';
import { santiagoParts } from '../../_utils/santiago-time';
import type { NormalizedMovement } from '../connector/normalized-banking.schema';

export function movementKey(accountExternalId: string, movementExternalId: string): string {
  return JSON.stringify([accountExternalId, movementExternalId]);
}

export function bookingDate(booked: NormalizedMovement['booked']): { bookedAt: Date; bookedOn: string | null } {
  if (booked.precision === 'instant') return { bookedAt: new Date(booked.at), bookedOn: null };

  // Chile changes its UTC offset with daylight saving time. Start safely
  // within the requested day, then move to noon in the Santiago calendar.
  const [year, month, day] = booked.on.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day, 15));
  const local = santiagoParts(candidate);
  const bookedAt = new Date(candidate.getTime() + (12 - Number(local.hour)) * 60 * 60 * 1000);
  const final = santiagoParts(bookedAt);
  if (`${final.year}-${final.month}-${final.day}` !== booked.on || final.hour !== '12') {
    throw new Error('Unable to represent the Santiago booking date');
  }
  return { bookedAt, bookedOn: booked.on };
}

export function movementDirection(amount: string): 'debit' | 'credit' {
  return toCents(amount) < 0n ? 'debit' : 'credit';
}
