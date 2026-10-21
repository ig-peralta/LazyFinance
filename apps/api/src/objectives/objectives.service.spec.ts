import type { ObjectiveRepository } from '../drizzle/repositories/objective.repository';
import type { TagRepository } from '../drizzle/repositories/tag.repository';
import type { TransactionRepository } from '../drizzle/repositories/transaction.repository';
import { describe, expect, it, vi } from 'vitest';
import { ObjectivesService } from './objectives.service';

const userId = '00000000-0000-4000-8000-000000000001';
const budgetId = '00000000-0000-4000-8000-000000000041';
const goalId = '00000000-0000-4000-8000-000000000042';

describe('ObjectivesService', () => {
  it('assembles budget and savings targets with their independent tag lists', async () => {
    const listForUser = vi.fn(async () => [
      {
        id: budgetId, name: 'Viaje', amount: '240000.00', kind: 'time_based' as const,
        intent: 'spending' as const, isRecurring: false, period: null,
        startDate: new Date('2025-09-01T15:00:00.000Z'), endDate: new Date('2025-10-01T15:00:00.000Z'),
      },
      {
        id: goalId, name: 'Fondo', amount: '6500000.00', kind: 'amount_based' as const,
        intent: 'saving' as const, isRecurring: null, period: null, startDate: null, endDate: null,
      },
    ]);
    const links = [
      { objectiveId: budgetId, id: '00000000-0000-4000-8000-000000000031', name: 'Familia', color: null },
      { objectiveId: budgetId, id: '00000000-0000-4000-8000-000000000032', name: 'Vacaciones', color: '#0D9488' },
    ];
    const listForObjectives = vi.fn(async () => links);
    const service = new ObjectivesService(
      { listForUser } as unknown as ObjectiveRepository,
      { listForObjectives } as unknown as TagRepository,
      {} as TransactionRepository,
    );

    await expect(service.getForUser(userId)).resolves.toEqual([
      {
        id: budgetId, name: 'Viaje', amount: '240000.00', kind: 'time_based', intent: 'spending',
        isRecurring: false, period: null,
        startDate: '2025-09-01T15:00:00.000Z', endDate: '2025-10-01T15:00:00.000Z',
        tags: links.map(({ objectiveId: _, ...tag }) => tag),
      },
      {
        id: goalId, name: 'Fondo', amount: '6500000.00', kind: 'amount_based', intent: 'saving',
        isRecurring: null, period: null, startDate: null, endDate: null, tags: [],
      },
    ]);
    expect(listForUser).toHaveBeenCalledWith(userId);
    expect(listForObjectives).toHaveBeenCalledWith(userId, [budgetId, goalId]);
  });

  it('does not query tags if there are no objectives', async () => {
    const listForUser = vi.fn(async () => []);
    const listForObjectives = vi.fn();
    const service = new ObjectivesService(
      { listForUser } as unknown as ObjectiveRepository,
      { listForObjectives } as unknown as TagRepository,
      {} as TransactionRepository,
    );

    await expect(service.getForUser(userId)).resolves.toEqual([]);
    expect(listForObjectives).not.toHaveBeenCalled();
  });

  it('combines single-tag movements across budget tags and separates monthly from yearly spend', async () => {
    const groceryId = '00000000-0000-4000-8000-000000000051';
    const vacationId = '00000000-0000-4000-8000-000000000052';
    const groceriesTag = '00000000-0000-4000-8000-000000000031';
    const familyTag = '00000000-0000-4000-8000-000000000032';
    const vacationTag = '00000000-0000-4000-8000-000000000033';
    const listForUser = vi.fn(async () => [
      { id: groceryId, name: 'Supermercado', amount: '280000.00', kind: 'time_based', intent: 'spending', isRecurring: true, period: 'monthly', startDate: new Date('2024-01-01T15:00:00Z'), endDate: null },
      { id: vacationId, name: 'Vacaciones', amount: '650000.00', kind: 'time_based', intent: 'spending', isRecurring: true, period: 'yearly', startDate: new Date('2024-01-01T15:00:00Z'), endDate: null },
      { id: goalId, name: 'Fondo', amount: '6500000.00', kind: 'amount_based', intent: 'saving', isRecurring: null, period: null, startDate: null, endDate: null },
    ]);
    const listForObjectives = vi.fn(async () => [
      { objectiveId: groceryId, id: groceriesTag, name: 'Supermercado', color: null },
      { objectiveId: groceryId, id: familyTag, name: 'Familia', color: null },
      { objectiveId: vacationId, id: vacationTag, name: 'Vacaciones', color: null },
    ]);
    const listTaggedDebitsForPeriod = vi.fn(async () => [
      { id: '00000000-0000-4000-8000-000000000061', amount: '-250000.00', bookedAt: new Date('2026-09-15T15:00:00Z'), tagId: groceriesTag },
      { id: '00000000-0000-4000-8000-000000000064', amount: '-50000.00', bookedAt: new Date('2026-09-15T15:00:00Z'), tagId: familyTag },
      { id: '00000000-0000-4000-8000-000000000062', amount: '-200000.00', bookedAt: new Date('2026-01-14T15:00:00Z'), tagId: vacationTag },
      { id: '00000000-0000-4000-8000-000000000063', amount: '-150000.00', bookedAt: new Date('2026-09-17T15:00:00Z'), tagId: vacationTag },
    ]);
    const service = new ObjectivesService(
      { listForUser } as unknown as ObjectiveRepository,
      { listForObjectives } as unknown as TagRepository,
      { listTaggedDebitsForPeriod } as unknown as TransactionRepository,
    );

    await expect(service.getSpendingProgressForUser(userId, '2026-09')).resolves.toEqual([
      { id: groceryId, name: 'Supermercado', month: '2026-09', period: 'monthly', limit: '280000.00', spent: '300000.00', remaining: '-20000.00', percentage: 107 },
      { id: vacationId, name: 'Vacaciones', month: '2026-09', period: 'yearly', limit: '650000.00', spent: '350000.00', remaining: '300000.00', percentage: 53 },
    ]);
    expect(listTaggedDebitsForPeriod).toHaveBeenCalledWith(
      userId, '2026-01-01 00:00:00', '2026-10-01 00:00:00',
    );
  });

  it('limits the current month’s budget query to now', async () => {
    const now = new Date('2026-10-16T15:00:00.000Z');
    const listTaggedDebitsForPeriod = vi.fn(async () => []);
    const service = new ObjectivesService(
      { listForUser: vi.fn(async () => [{
        id: budgetId, name: 'Supermercado', amount: '280000.00', kind: 'time_based',
        intent: 'spending', isRecurring: true, period: 'monthly',
        startDate: new Date('2024-01-01T15:00:00.000Z'), endDate: null,
      }]) } as unknown as ObjectiveRepository,
      { listForObjectives: vi.fn(async () => [{
        objectiveId: budgetId, id: '00000000-0000-4000-8000-000000000031', name: 'Supermercado', color: null,
      }]) } as unknown as TagRepository,
      { listTaggedDebitsForPeriod } as unknown as TransactionRepository,
    );

    await service.getSpendingProgressForUser(userId, '2026-10', now);
    expect(listTaggedDebitsForPeriod).toHaveBeenCalledWith(
      userId, '2026-10-01 00:00:00', '2026-11-01 00:00:00', now,
    );
  });
});
