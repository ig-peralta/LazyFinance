import type { ObjectiveSummary } from '@lazyfinance/contracts';
import { Injectable } from '@nestjs/common';
import { ObjectiveRepository } from '../drizzle/repositories/objective.repository';
import { TagRepository } from '../drizzle/repositories/tag.repository';

@Injectable()
export class ObjectivesService {
  constructor(
    private readonly objectives: ObjectiveRepository,
    private readonly tags: TagRepository,
  ) {}

  async getForUser(userId: string): Promise<ObjectiveSummary[]> {
    const rows = await this.objectives.listForUser(userId);
    if (rows.length === 0) return [];

    const links = await this.tags.listForObjectives(userId, rows.map(({ id }) => id));
    const tagsByObjective = new Map<string, ObjectiveSummary['tags']>();
    for (const { objectiveId, ...tag } of links) {
      const items = tagsByObjective.get(objectiveId) ?? [];
      items.push(tag);
      tagsByObjective.set(objectiveId, items);
    }

    return rows.map(({ startDate, endDate, ...item }) => ({
      ...item,
      startDate: startDate?.toISOString() ?? null,
      endDate: endDate?.toISOString() ?? null,
      tags: tagsByObjective.get(item.id) ?? [],
    }));
  }
}
