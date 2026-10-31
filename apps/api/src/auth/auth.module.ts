import { Module } from '@nestjs/common';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { EnvironmentModule } from '../environment/environment.module';
import { AuthHttpController } from './auth.http';
import { AuthService } from './auth.service';
import { FirebaseIdTokenVerifier } from './firebase/firebase-id-token.verifier';
import { MockAuthService } from './mock/mock-auth.service';

@Module({
  imports: [DrizzleModule, EnvironmentModule],
  controllers: [AuthHttpController],
  providers: [AuthService, FirebaseIdTokenVerifier, MockAuthService],
  exports: [AuthService, FirebaseIdTokenVerifier],
})
export class AuthModule {}
