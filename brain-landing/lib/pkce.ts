import { createHash, randomBytes } from 'node:crypto'

/**
 * PKCE helpers (RFC 7636) + state generator. All values are URL-safe
 * base64 (no padding) so they survive in headers and URLs.
 */

function base64url(bytes: Buffer): string {
  return bytes
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export function generateCodeVerifier(): string {
  return base64url(randomBytes(32))
}

export function generateCodeChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest())
}

export function generateState(): string {
  return base64url(randomBytes(16))
}
