import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { TaggingService } from './tagging.service';

@Controller('tags')
export class TagsHttpController {
  constructor(private readonly tagging: TaggingService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Req() request: AuthenticatedRequest) {
    return this.tagging.listTagsForUser(request.principal.userId);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.tagging.createTagForUser(request.principal.userId, body);
  }
}

@Controller('tag-rules')
export class TagRulesHttpController {
  constructor(private readonly tagging: TaggingService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Req() request: AuthenticatedRequest) {
    return this.tagging.listRulesForUser(request.principal.userId);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.tagging.createRuleForUser(request.principal.userId, body);
  }

  @Put(':id')
  replace(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.tagging.replaceRuleForUser(request.principal.userId, id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.tagging.archiveRuleForUser(request.principal.userId, id);
  }

  @Post(':id/apply')
  @HttpCode(200)
  apply(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Query('after') after?: string) {
    return this.tagging.applyApprovedRuleToExistingForUser(request.principal.userId, id, after);
  }
}

@Controller('transactions')
export class TransactionTagsHttpController {
  constructor(private readonly tagging: TaggingService) {}

  @Put(':id/tag')
  assign(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.tagging.assignManualTagForUser(request.principal.userId, id, body);
  }

  @Delete(':id/tag-decision')
  @HttpCode(200)
  reset(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.tagging.resetTagDecisionForUser(request.principal.userId, id);
  }

  @Get(':id/tag-suggestions')
  @Header('Cache-Control', 'private, no-store')
  suggestions(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.tagging.suggestionsForUser(request.principal.userId, id);
  }
}
