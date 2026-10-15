import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { AuthService } from './auth.service';

@Module({
  imports: [DrizzleModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
