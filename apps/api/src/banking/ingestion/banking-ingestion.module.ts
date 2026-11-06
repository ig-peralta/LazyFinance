import { Module } from '@nestjs/common';
import { PersistenceModule } from '../../persistence/persistence.module';
import { TaggingModule } from '../../transactions/tagging/tagging.module';
import { BankingIngestionService } from './banking-ingestion.service';

@Module({ imports: [PersistenceModule, TaggingModule], providers: [BankingIngestionService], exports: [BankingIngestionService] })
export class BankingIngestionModule {}
