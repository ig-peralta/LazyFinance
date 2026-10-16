import { Controller, Get, Req } from '@nestjs/common';
import type { AuthenticatedRequest, AuthPrincipal } from './auth.types';

@Controller('auth')
export class AuthHttpController {
  @Get('principal')
  getPrincipal(@Req() request: AuthenticatedRequest): AuthPrincipal {
    return request.user;
  }
}
