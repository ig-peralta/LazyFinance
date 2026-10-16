import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { AuthHttpController } from './auth.http';
import { AuthService } from './auth.service';

@Module({
  imports: [DrizzleModule],
  controllers: [AuthHttpController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
