import "reflect-metadata";
import { Logger } from "@nestjs/common";

// Router discovery is verbose and repeated for each isolated testing module.
Logger.overrideLogger(false);
