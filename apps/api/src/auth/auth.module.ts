import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { EnvironmentModule } from '../environment/environment.module';
import { AuthHttpController } from './auth.http';
import { AuthService } from './auth.service';
import { FirebaseAuthService } from './firebase/firebase-auth.service';
import { MockAuthService } from './mock/mock-auth.service';

@Module({
  imports: [DrizzleModule, EnvironmentModule],
  controllers: [AuthHttpController],
  providers: [AuthService, FirebaseAuthService, MockAuthService],
  exports: [AuthService, FirebaseAuthService],
})
export class AuthModule {}
