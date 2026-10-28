import { Module } from '@nestjs/common';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { TaggingModule } from '../../transactions/tagging/tagging.module';
import { BankingIngestionService } from './banking-ingestion.service';

@Module({ imports: [DrizzleModule, TaggingModule], providers: [BankingIngestionService], exports: [BankingIngestionService] })
export class BankingIngestionModule {}
