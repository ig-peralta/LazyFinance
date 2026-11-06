import {
  ManualTagDecisionInputSchema, TagCreateInputSchema, TagRuleInputSchema,
} from '@lazyfinance/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { TaggingRepository } from '../../persistence/repositories/tagging.repository';

function parse<T>(contract: z.ZodType<T>, value: unknown): T {
  const result = contract.safeParse(value);
  if (!result.success) throw new BadRequestException({ message: 'Invalid tag input', issues: result.error.issues });
  return result.data;
}

@Injectable()
export class TaggingService {
  constructor(private readonly tagging: TaggingRepository) {}

  listTagsForUser(userId: string) {
    return this.tagging.listTagsForUser(userId);
  }

  async createTagForUser(userId: string, value: unknown) {
    return this.tagging.createTagForUser(userId, parse(TagCreateInputSchema, value));
  }

  async assignManualTagForUser(userId: string, transactionId: string, value: unknown) {
    const { tagId } = parse(ManualTagDecisionInputSchema, value);
    return this.tagging.assignManualTagForUser(userId, transactionId, tagId);
  }

  async resetTagDecisionForUser(userId: string, transactionId: string) {
    return this.tagging.resetTagDecisionForUser(userId, transactionId);
  }

  listRulesForUser(userId: string) {
    return this.tagging.listRulesForUser(userId);
  }

  async createRuleForUser(userId: string, value: unknown) {
    return this.tagging.createRuleForUser(userId, parse(TagRuleInputSchema, value));
  }

  async replaceRuleForUser(userId: string, id: string, value: unknown) {
    return this.tagging.replaceRuleForUser(userId, id, parse(TagRuleInputSchema, value));
  }

  async archiveRuleForUser(userId: string, id: string) {
    return this.tagging.archiveRuleForUser(userId, id);
  }

  async applyApprovedRuleToExistingForUser(userId: string, id: string, after?: string) {
    if (after !== undefined && !z.uuid().safeParse(after).success) throw new BadRequestException('Invalid rule cursor');
    return this.tagging.applyApprovedRuleToExistingForUser(userId, id, after);
  }

  async suggestionsForUser(userId: string, transactionId: string) {
    return this.tagging.suggestionsForUser(userId, transactionId);
  }
}
