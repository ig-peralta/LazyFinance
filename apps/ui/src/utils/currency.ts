const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

export function formatClp(amount: number): string {
  return Number.isFinite(amount) ? clp.format(amount) : '—';
}
