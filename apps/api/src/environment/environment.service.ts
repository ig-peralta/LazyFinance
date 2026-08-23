import { Injectable, Logger } from "@nestjs/common";
import { EnvironmentVariables } from "./environment.schema";
import { loadEnvironmentVariables } from "./environment.loader";

@Injectable()
export class EnvironmentService {
  private readonly logger = new Logger(EnvironmentService.name);

  private _variables: EnvironmentVariables;

  private _load(): void {
    this._variables = loadEnvironmentVariables();
    this.logger.log('Environment variables loaded successfully');
  }

  get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    if (!this._variables)
      this._load();

    return this._variables[key];
  }
}

