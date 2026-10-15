import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Controller()
export class AppHttpController {
  @Get()
  @Public()
  getStatus(): string {
    return 'listening';
  }
}
