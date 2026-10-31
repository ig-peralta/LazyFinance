import { isPlatformServer } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { SessionService } from './session/session.service';

export function initializeServices(): Promise<void> {
  const session = inject(SessionService);
  return isPlatformServer(inject(PLATFORM_ID))
    ? session.initServerSide()
    : session.initClientSide();
}
