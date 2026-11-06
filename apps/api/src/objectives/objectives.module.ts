import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { ObjectivesHttpController } from './objectives.http';
import { ObjectivesMcpController } from './objectives.mcp';
import { ObjectivesService } from './objectives.service';

@Module({
  imports: [PersistenceModule],
  controllers: [ObjectivesHttpController, ObjectivesMcpController],
  providers: [ObjectivesService],
})
export class ObjectivesModule {}
