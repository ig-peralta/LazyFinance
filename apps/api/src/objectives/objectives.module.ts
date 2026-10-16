import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { ObjectivesHttpController } from './objectives.http';
import { ObjectivesService } from './objectives.service';

@Module({
  imports: [DrizzleModule],
  controllers: [ObjectivesHttpController],
  providers: [ObjectivesService],
})
export class ObjectivesModule {}
