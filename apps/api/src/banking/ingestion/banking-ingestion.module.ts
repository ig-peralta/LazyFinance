import { Module } from '@nestjs/common';
import { PersistenceModule } from '../../persistence/persistence.module';
import { BankingIngestionService } from './banking-ingestion.service';

@Module({ imports: [PersistenceModule], providers: [BankingIngestionService], exports: [BankingIngestionService] })
export class BankingIngestionModule {}
