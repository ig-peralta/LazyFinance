import { Module } from '@nestjs/common';
import { drizzleProvider } from './drizzle.provider';
import { AccountRepository } from './repositories/account.repository';
import { ObjectiveRepository } from './repositories/objective.repository';
import { TagRepository } from './repositories/tag.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { ExternalIdentityRepository } from './repositories/external-identity.repository';
import { IncomeRepository } from './repositories/income.repository';
import { BankingIngestionRepository } from './repositories/banking-ingestion.repository';
import { TaggingRepository } from './repositories/tagging.repository';

@Module({
  exports: [
    AccountRepository,
    ObjectiveRepository,
    TagRepository,
    TransactionRepository,
    ExternalIdentityRepository,
    IncomeRepository,
    BankingIngestionRepository,
    TaggingRepository,
  ],
  providers: [
    ...drizzleProvider,
    AccountRepository,
    ObjectiveRepository,
    TagRepository,
    TransactionRepository,
    ExternalIdentityRepository,
    IncomeRepository,
    BankingIngestionRepository,
    TaggingRepository,
  ],
})
export class PersistenceModule {}
