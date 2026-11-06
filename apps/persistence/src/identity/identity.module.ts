import { Module } from "@nestjs/common";
import { ExternalIdentityModule } from "./external-identity/external-identity.module";

@Module({ imports: [ExternalIdentityModule] })
export class IdentityModule {}
