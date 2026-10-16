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
