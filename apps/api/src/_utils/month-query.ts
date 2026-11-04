import { MonthSchema } from '@lazyfinance/contracts';
import { BadRequestException } from '@nestjs/common';
import { santiagoMonth } from './santiago-time';

export function checkedMonth(month: string): string {
  if (!MonthSchema.safeParse(month).success || month > santiagoMonth(new Date())) {
    throw new BadRequestException('month must be YYYY-MM and cannot be in the future');
  }
  return month;
}
