import { Module } from "@nestjs/common";
import { EnvironmentModule } from "../environment/environment.module";
import { ConfigRpc } from "./config.rpc";

@Module({ imports: [EnvironmentModule], providers: [ConfigRpc] })
export class ConfigModule {}
