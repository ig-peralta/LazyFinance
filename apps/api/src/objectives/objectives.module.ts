import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { ObjectivesHttpController } from './objectives.http';
import { ObjectivesMcpController } from './objectives.mcp';
import { ObjectivesService } from './objectives.service';

@Module({
  imports: [DrizzleModule],
  controllers: [ObjectivesHttpController, ObjectivesMcpController],
  providers: [ObjectivesService],
})
export class ObjectivesModule {}
