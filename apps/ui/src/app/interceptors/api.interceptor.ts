import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_URL } from '../tokens/api-url';
import { SessionService } from '../services/session/session.service';

export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  const apiUrl = inject(API_URL).replace(/\/$/, '');

  if (request.url !== apiUrl && !request.url.startsWith(`${apiUrl}/`)) return next(request);
  if (request.headers.has('Authorization')) return next(request);

  const token = inject(SessionService).token();
  if (!token) return next(request);

  return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
