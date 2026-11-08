const integer = new Intl.NumberFormat("es-CL");

export function moneyCents(amount: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) throw new Error("Invalid decimal money");
  const value =
    BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -value : value;
}

export function formatClp(amount: string): string {
  try {
    const cents = moneyCents(amount),
      absolute = cents < 0n ? -cents : cents;
    const fraction = absolute % 100n;
    return `${cents < 0n ? "-" : ""}$${integer.format(absolute / 100n)}${fraction ? `,${String(fraction).padStart(2, "0")}` : ""}`;
  } catch {
    return "—";
  }
}

/** Bounded visual ratio only; financial amounts never pass through Number. */
export function progressWidth(value: string, target: string): number {
  try {
    const limit = moneyCents(target),
      amount = moneyCents(value);
    if (limit <= 0n || amount <= 0n) return 0;
    return Number(amount >= limit ? 10000n : (amount * 10000n) / limit) / 100;
  } catch {
    return 0;
  }
}
