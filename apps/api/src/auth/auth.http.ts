import type { AuthConfig, AuthPrincipal, MockLoginResult } from '@lazyfinance/contracts';
import { Body, Controller, Get, Header, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthHttpController {
  constructor(private readonly auth: AuthService) {}

  @Get('config')
  @Public()
  @Header('Cache-Control', 'no-store')
  getConfig(): AuthConfig {
    return this.auth.config();
  }

  @Post('mock/login')
  @Public()
  @Header('Cache-Control', 'no-store')
  loginMock(@Body() body: unknown): Promise<MockLoginResult> {
    return this.auth.loginMock(body);
  }

  @Get('principal')
  @Header('Cache-Control', 'private, no-store')
  getPrincipal(@Req() request: AuthenticatedRequest): AuthPrincipal {
    return request.principal;
  }
}
