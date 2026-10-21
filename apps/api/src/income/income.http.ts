import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { IncomeService } from './income.service';

@Controller('income')
export class IncomeHttpController {
  constructor(private readonly income: IncomeService) {}

  @Get('sources')
  @Header('Cache-Control', 'private, no-store')
  listSources(@Req() request: AuthenticatedRequest) {
    return this.income.listSourcesForUser(request.principal.userId);
  }

  @Get('sources/:id')
  @Header('Cache-Control', 'private, no-store')
  getSource(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.income.getSourceForUser(request.principal.userId, id);
  }

  @Post('sources')
  createSource(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.income.createSourceForUser(request.principal.userId, body);
  }

  @Put('sources/:id')
  updateSource(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.income.updateSourceForUser(request.principal.userId, id, body);
  }

  @Post('sources/:id/archive')
  @HttpCode(200)
  archiveSource(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.income.archiveSourceForUser(request.principal.userId, id);
  }

  @Get('sources/:id/expectations')
  @Header('Cache-Control', 'private, no-store')
  listExpectations(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.income.listExpectationsForUser(request.principal.userId, id);
  }

  @Post('sources/:id/expectations')
  createExpectation(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.income.createExpectationForUser(request.principal.userId, id, body);
  }

  @Put('expectations/:id')
  updateExpectation(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.income.updateExpectationForUser(request.principal.userId, id, body);
  }

  @Delete('expectations/:id')
  @HttpCode(204)
  deleteExpectation(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.income.deleteExpectationForUser(request.principal.userId, id);
  }

  @Get('expected')
  @Header('Cache-Control', 'private, no-store')
  getExpected(@Req() request: AuthenticatedRequest, @Query('month') month?: string) {
    return this.income.getExpectedForUser(request.principal.userId, month);
  }

  @Get('receipts')
  @Header('Cache-Control', 'private, no-store')
  getReceipts(@Req() request: AuthenticatedRequest, @Query('month') month?: string) {
    return this.income.listReceiptsForUser(request.principal.userId, month);
  }

  @Put('receipts/:transactionId')
  confirmReceipt(@Req() request: AuthenticatedRequest, @Param('transactionId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.income.confirmReceiptForUser(request.principal.userId, id, body);
  }

  @Delete('receipts/:transactionId')
  @HttpCode(204)
  clearReceipt(@Req() request: AuthenticatedRequest, @Param('transactionId', ParseUUIDPipe) id: string) {
    return this.income.clearReceiptForUser(request.principal.userId, id);
  }

  @Get('summary')
  @Header('Cache-Control', 'private, no-store')
  getSummary(@Req() request: AuthenticatedRequest, @Query('month') month?: string) {
    return this.income.getSummaryForUser(request.principal.userId, month);
  }
}
