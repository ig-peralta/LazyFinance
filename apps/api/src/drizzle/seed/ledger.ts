import type { NewTransactionRow } from '../schema';
import type { TagKey } from './catalog';
import { bookedDate, clp, seedId, variedAmount } from './helpers';
import { accounts, type AccountKey } from './profile';

export type LedgerEntry = Omit<NewTransactionRow, 'id' | 'bookedAt'> & {
  id: string;
  bookedAt: Date;
  tags: TagKey[];
};

// A Santiago professional paid near month-end, renting in Ñuñoa, using Metro and
// paying the credit card in full each following month. All amounts are CLP.
export function buildLedger(asOf = new Date()): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  let previousCardSpending = 0;

  for (let year = 2024; year <= asOf.getUTCFullYear(); year++) {
    for (let month = 0; month < 12; month++) {
      if (Date.UTC(year, month, 1) > asOf.getTime()) break;

      const period = `${year}-${String(month + 1).padStart(2, '0')}`;
      const costFactor = 1.045 ** (year - 2024);
      const price = (amount: number) => Math.round((amount * costFactor) / 100) * 100;
      const varied = (key: string, low: number, high: number) =>
        price(variedAmount(`${period}:${key}`, low, high));

      function add(
        account: AccountKey,
        key: string,
        day: number,
        amount: number,
        merchant: string,
        tags: TagKey[],
        description = merchant,
        isInternalMovement = false,
      ): boolean {
        const bookedAt = bookedDate(year, month, day);
        if (bookedAt > asOf) return false;
        const id = seedId(`transaction:${period}:${account}:${key}`);
        entries.push({
          id,
          accountId: accounts[account].id,
          bookedAt,
          amount: clp(amount),
          type: amount < 0 ? 'debit' : 'credit',
          source: 'manual',
          merchant,
          description,
          externalId: `demo:${id}`,
          isInternalMovement,
          tags,
        });
        return true;
      }

      function cardCharge(key: string, day: number, amount: number, merchant: string, tags: TagKey[]) {
        if (add('creditCard', key, day, -amount, merchant, tags)) {
          cardSpending += amount;
        }
      }

      if (previousCardSpending > 0) {
        add('checking', 'card-payment', 9, -previousCardSpending, 'Banco', ['transfer'], 'Pago de tarjeta de crédito', true);
        add('creditCard', 'card-payment', 9, previousCardSpending, 'Banco', ['transfer'], 'Pago recibido de cuenta corriente', true);
      }

      const salary = Math.round(1_550_000 * 1.06 ** (year - 2024) / 1000) * 1000 + (month >= 6 ? 30_000 : 0);
      add('checking', 'salary', 25, salary, 'Empleador', ['salary'], 'Sueldo líquido mensual');
      add('checking', 'rent', 3, -price(525_000), 'Arriendo Ñuñoa', ['housing'], 'Arriendo departamento');
      add('checking', 'building-fees', 6, -varied('building-fees', 68_000, 85_000), 'Gastos comunes', ['housing']);

      const winter = month >= 4 && month <= 7;
      add('checking', 'electricity', 10, -varied('electricity', winter ? 48_000 : 27_000, winter ? 67_000 : 42_000), 'Enel', ['utilities']);
      add('checking', 'water', 13, -varied('water', 14_000, 22_000), 'Aguas Andinas', ['utilities']);
      add('checking', 'gas', 16, -varied('gas', winter ? 40_000 : 18_000, winter ? 59_000 : 31_000), 'Metrogas', ['utilities']);
      add('checking', 'internet', 12, -price(23_990), 'Movistar Hogar', ['utilities']);
      add('checking', 'mobile', 15, -price(12_990), 'Entel', ['utilities']);
      add('checking', 'insurance', 7, -price(28_000), 'Seguro complementario', ['health']);

      const groceryStores = ['Líder', 'Feria libre Ñuñoa', 'Unimarc', 'Jumbo'];
      for (let week = 0; week < 4; week++) {
        add('checking', `groceries-${week}`, 4 + week * 7, -varied(`groceries-${week}`, 39_000, 57_000), groceryStores[week], ['groceries']);
        add('checking', `metro-${week}`, 7 + week * 7, -varied(`metro-${week}`, 12_000, 18_000), 'Metro de Santiago', ['transport'], 'Recarga Bip!');
      }

      add('checking', 'rideshare', 19, -varied('rideshare', 9_000, 20_000), 'Uber', ['transport']);
      add('checking', 'lunch', 11, -varied('lunch', 14_000, 25_000), 'Almuerzo en oficina', ['dining']);
      add('checking', 'dinner', 22, -varied('dinner', 24_000, 46_000), 'Restaurante Barrio Italia', ['dining', 'leisure']);
      add('checking', 'cinema', 20, -varied('cinema', 12_000, 23_000), 'Cine Hoyts', ['leisure']);
      add('checking', 'family', 17, -price(35_000), 'Transferencia familiar', ['family']);
      if (month % 3 === 0) {
        add('checking', 'pharmacy', 18, -varied('pharmacy', 15_000, 34_000), 'Farmacias Ahumada', ['health']);
      }

      let cardSpending = 0;
      cardCharge('streaming', 5, price(8_990), 'Netflix', ['subscriptions', 'leisure']);
      cardCharge('music', 12, price(4_990), 'Spotify', ['subscriptions', 'leisure']);
      cardCharge('cloud', 15, price(3_990), 'Google One', ['subscriptions']);
      cardCharge('shopping', 21, varied('shopping', 28_000, 67_000), month % 2 ? 'Mercado Libre Chile' : 'Falabella', ['shopping']);

      // Occasional events make comparisons and anomaly detection useful.
      if (month === 0) {
        add('checking', 'summer-trip', 14, -varied('summer-trip', 150_000, 245_000), 'Viaje a Valparaíso', ['vacation', 'leisure']);
      }
      if (month === 3 && year > 2024) {
        add('checking', 'tax-refund', 26, varied('tax-refund', 75_000, 125_000), 'Tesorería General de la República', ['extraIncome'], 'Devolución Operación Renta');
      }
      if (month === 8) {
        add('checking', 'national-holidays', 17, -varied('national-holidays', 105_000, 185_000), 'Viaje Fiestas Patrias', ['vacation', 'family']);
      }
      if (month === 11) {
        add('checking', 'holiday-bonus', 23, price(160_000), 'Empleador', ['extraIncome'], 'Aguinaldo de Navidad');
        add('checking', 'gifts', 19, -varied('gifts', 85_000, 145_000), 'Regalos de Navidad', ['family', 'shopping']);
      }
      if (year === 2024 && month === 6) {
        add('checking', 'freelance', 22, 145_000, 'Proyecto de diseño', ['extraIncome'], 'Ingreso ocasional');
      }
      if (year === 2025 && month === 5) {
        add('checking', 'dentist', 16, -238_000, 'Clínica dental', ['health', 'unexpected']);
      }
      if (year === 2025 && month === 10) {
        cardCharge('duplicate-streaming', 6, price(8_990), 'Netflix', ['subscriptions', 'unexpected']);
      }
      if (year === 2026 && month === 2) {
        cardCharge('laptop-repair', 13, 285_000, 'Servicio técnico', ['shopping', 'unexpected']);
      }

      const savings = month === 0 ? 80_000 : month === 11 ? 100_000 : 140_000 + (year - 2024) * 10_000;
      add('checking', 'savings-transfer', 28, -savings, 'Ahorro programado', ['transfer'], 'Transferencia a cuenta de ahorro', true);
      add('savings', 'savings-transfer', 28, savings, 'Ahorro programado', ['savings'], 'Abono desde cuenta corriente', true);

      previousCardSpending = cardSpending;
    }
  }

  return entries.sort((a, b) => a.bookedAt.getTime() - b.bookedAt.getTime());
}
