const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

export function formatClp(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  return amount < 0 ? `-${clp.format(-amount)}` : clp.format(amount);
}
