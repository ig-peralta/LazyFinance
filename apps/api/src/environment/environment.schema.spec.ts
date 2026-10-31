import { describe, expect, it } from 'vitest';
import { ENV_SCHEMA } from './environment.schema';

describe('CORS origins', () => {
  it('parses a comma-separated allowlist of browser origins', () => {
    expect(ENV_SCHEMA.parse({ CORS_ORIGINS: ' https://ui.example.cl , http://localhost:4200 ' }).CORS_ORIGINS)
      .toEqual(['https://ui.example.cl', 'http://localhost:4200']);
  });

  it.each(['*', '', 'http://localhost:4200/path', 'not-an-origin'])(
    'rejects invalid origins: %s',
    (origins) => expect(() => ENV_SCHEMA.parse({ CORS_ORIGINS: origins })).toThrow(),
  );
});

describe('Firebase project configuration', () => {
  it('keeps Firebase verification optional until the application-user integration is enabled', () => {
    expect(ENV_SCHEMA.parse({}).FIREBASE_PROJECT_ID).toBeUndefined();
    expect(ENV_SCHEMA.parse({ FIREBASE_PROJECT_ID: ' lazyfinance-dev ' }).FIREBASE_PROJECT_ID)
      .toBe('lazyfinance-dev');
  });

  it('rejects an empty configured project', () => {
    expect(() => ENV_SCHEMA.parse({ FIREBASE_PROJECT_ID: ' ' })).toThrow();
  });

  it('accepts a service-account email and key together with a project ID', () => {
    expect(ENV_SCHEMA.parse({
      FIREBASE_PROJECT_ID: 'lazyfinance-dev',
      FIREBASE_CLIENT_EMAIL: ' firebase-adminsdk@lazyfinance-dev.iam.gserviceaccount.com ',
      FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----',
    }).FIREBASE_CLIENT_EMAIL).toBe('firebase-adminsdk@lazyfinance-dev.iam.gserviceaccount.com');
  });

  it.each([
    { FIREBASE_PROJECT_ID: 'lazyfinance-dev', FIREBASE_CLIENT_EMAIL: 'admin@example.com' },
    { FIREBASE_PROJECT_ID: 'lazyfinance-dev', FIREBASE_PRIVATE_KEY: 'private-key' },
    { FIREBASE_CLIENT_EMAIL: 'admin@example.com', FIREBASE_PRIVATE_KEY: 'private-key' },
    { FIREBASE_PROJECT_ID: 'lazyfinance-dev', FIREBASE_CLIENT_EMAIL: ' ', FIREBASE_PRIVATE_KEY: 'private-key' },
  ])('rejects incomplete Firebase service-account configuration: %j', (configuration) => {
    expect(() => ENV_SCHEMA.parse(configuration)).toThrow();
  });
});
