import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppHttpController {
  @Get()
  getStatus(): string {
    return 'listening';
  }
}
