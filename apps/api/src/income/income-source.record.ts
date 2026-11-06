import type { IncomeSourceInput } from '@lazyfinance/contracts';

/** Source facts used by the income calendar, independent of the database schema. */
export type IncomeSourceRecord = IncomeSourceInput & {
  id: string;
  userId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
