import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { SummariesHttpController } from './summaries.http';
import { SummariesService } from './summaries.service';

@Module({
  imports: [DrizzleModule],
  controllers: [SummariesHttpController],
  providers: [SummariesService],
})
export class SummariesModule {}
