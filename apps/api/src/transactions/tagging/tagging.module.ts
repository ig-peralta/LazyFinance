import { Module } from '@nestjs/common';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { TagRulesHttpController, TagsHttpController, TransactionTagsHttpController } from './tagging.http';
import { TaggingService } from './tagging.service';

@Module({
  imports: [DrizzleModule],
  controllers: [TagsHttpController, TagRulesHttpController, TransactionTagsHttpController],
  providers: [TaggingService],
  exports: [TaggingService],
})
export class TaggingModule {}
