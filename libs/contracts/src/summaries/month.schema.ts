import { z } from 'zod';

export const MonthSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);
export type Month = z.infer<typeof MonthSchema>;
