export interface SessionUser {
  userId: string;
  email: string;
  name: string;
}

export type SessionState = { user: SessionUser; token: string } | null;
