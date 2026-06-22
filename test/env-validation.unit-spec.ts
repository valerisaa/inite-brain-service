/**
 * Unit coverage for validateEnv — focuses on the production fail-closed
 * assertion for the scoped DB pool (SURREALDB_SCOPED_USER/PASS). Without
 * those, withScopedCompany() silently falls back to the root pool and the
 * DB-level PII fence is bypassed; production must refuse to start.
 */
import { validateEnv } from '../src/common/env-validation';

function baseProdEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    SURREALDB_URL: 'ws://db:8000',
    SURREALDB_USERNAME: 'root',
    SURREALDB_PASSWORD: 'root',
    OPENAI_API_KEY: 'sk-test',
    FORGET_HMAC_KEY: 'a'.repeat(40),
    BRAIN_API_KEYS: JSON.stringify([
      { keyHash: 'h', companyId: 'co_a', scopes: ['brain:read'] },
    ]),
    SURREALDB_SCOPED_USER: 'brain_caller',
    SURREALDB_SCOPED_PASS: 'scoped-secret',
  };
}

describe('validateEnv — scoped pool fence', () => {
  it('passes in production when both scoped creds are set', () => {
    expect(() => validateEnv(baseProdEnv())).not.toThrow();
  });

  it('throws in production when scoped creds are missing', () => {
    const env = baseProdEnv();
    delete env.SURREALDB_SCOPED_USER;
    delete env.SURREALDB_SCOPED_PASS;
    expect(() => validateEnv(env)).toThrow(/SURREALDB_SCOPED_USER/);
  });

  it('throws in production when only one scoped cred is set', () => {
    const env = baseProdEnv();
    delete env.SURREALDB_SCOPED_PASS;
    expect(() => validateEnv(env)).toThrow(/SURREALDB_SCOPED/);
  });

  it('does not throw in development when scoped creds are missing', () => {
    const env = baseProdEnv();
    env.NODE_ENV = 'development';
    delete env.SURREALDB_SCOPED_USER;
    delete env.SURREALDB_SCOPED_PASS;
    delete env.FORGET_HMAC_KEY; // dev default allowed
    expect(() => validateEnv(env)).not.toThrow();
  });
});
