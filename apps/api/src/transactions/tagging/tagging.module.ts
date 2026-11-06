import { Module } from '@nestjs/common';
import { PersistenceModule } from '../../persistence/persistence.module';
import { TagRulesHttpController, TagsHttpController, TransactionTagsHttpController } from './tagging.http';
import { TaggingService } from './tagging.service';

@Module({
  imports: [PersistenceModule],
  controllers: [TagsHttpController, TagRulesHttpController, TransactionTagsHttpController],
  providers: [TaggingService],
  exports: [TaggingService],
})
export class TaggingModule {}
