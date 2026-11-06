import { Module } from "@nestjs/common";
import { EnvironmentModule } from "../environment/environment.module";
import { PersistenceModule } from "../persistence/persistence.module";
import { AuthRpc } from "./auth.rpc";
import { AuthService } from "./auth.service";
import { FirebaseAuthService } from "./firebase/firebase-auth.service";
import { MockAuthService } from "./mock/mock-auth.service";

@Module({
  imports: [PersistenceModule, EnvironmentModule],
  providers: [AuthService, FirebaseAuthService, MockAuthService, AuthRpc],
  exports: [AuthService, FirebaseAuthService],
})
export class AuthModule {}
