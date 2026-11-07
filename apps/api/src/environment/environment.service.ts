import { Injectable, Logger } from "@nestjs/common";
import { loadEnvironmentVariables } from "./environment.loader";
import { EnvironmentVariables } from "./environment.schema";

@Injectable()
export class EnvironmentService {
  private readonly logger = new Logger(EnvironmentService.name);

  private _variables?: EnvironmentVariables;

  get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    if (!this._variables) {
      this._variables = loadEnvironmentVariables();
      this.logger.log("Environment variables loaded successfully");
    }

    return this._variables[key];
  }
}
