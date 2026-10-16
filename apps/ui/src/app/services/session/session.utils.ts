import type { SessionState } from './session.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isSessionState(value: unknown): value is NonNullable<SessionState> {
  if (!isRecord(value) || !isRecord(value['user'])) return false;

  const user = value['user'];
  return (
    typeof value['token'] === 'string' &&
    value['token'].trim().length > 0 &&
    typeof user['userId'] === 'string' &&
    user['userId'].trim().length > 0 &&
    typeof user['email'] === 'string' &&
    typeof user['name'] === 'string'
  );
}
