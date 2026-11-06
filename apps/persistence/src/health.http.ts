import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthHttp {
  @Get()
  status() {
    return { status: "ok", service: "persistence" };
  }
}
