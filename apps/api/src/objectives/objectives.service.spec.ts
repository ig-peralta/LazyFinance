import type { ObjectiveRepository } from '../drizzle/repositories/objective.repository';
import type { TagRepository } from '../drizzle/repositories/tag.repository';
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
    );

    await expect(service.getForUser(userId)).resolves.toEqual([]);
    expect(listForObjectives).not.toHaveBeenCalled();
  });
});
