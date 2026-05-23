/**
 * Server-side client to the brain backend.
 *
 * The admin BFF (`/api/admin/proxy/[...path]`) calls into here. We
 * intentionally do NOT forward the user's cookie JWT — that token has
 * audience='brain-landing' and brain backend validates audience='brain'.
 *
 * Instead, brain-landing acts as an OAuth client and mints a
 * machine-to-machine token via the `client_credentials` grant against
 * auth.inite.ai. The token has aud='brain' and scopes=brain:admin
 * (subject to client allowlist on the auth-service side). Tokens are
 * cached in-process until ~30s before expiry.
 */

const BRAIN_API_URL =
  process.env.BRAIN_API_URL ||
  process.env.NEXT_PUBLIC_BRAIN_API_URL ||
  'https://brain.inite.ai'

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL ||
  process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ||
  'https://auth.inite.ai'

const CLIENT_ID =
  process.env.OAUTH_CLIENT_ID ||
  process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID ||
  'brain-landing'

const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || ''

const BRAIN_AUDIENCE = process.env.BRAIN_AUDIENCE || 'brain'
const BRAIN_SCOPE =
  process.env.BRAIN_SCOPE || 'brain:read brain:write brain:admin brain:read_pii'

interface CachedToken {
  accessToken: string
  /** Unix epoch ms; we refresh ~30s before this. */
  expiresAtMs: number
}

let cached: CachedToken | null = null
let inFlight: Promise<CachedToken> | null = null

async function fetchServiceToken(): Promise<CachedToken> {
  if (!CLIENT_SECRET) {
    throw new Error('OAUTH_CLIENT_SECRET is not configured')
  }
  const res = await fetch(`${AUTH_SERVICE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: BRAIN_SCOPE,
      audience: BRAIN_AUDIENCE,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(
      `client_credentials grant failed: ${res.status} ${text.slice(0, 200)}`,
    )
  }
  const body = (await res.json()) as {
    access_token: string
    expires_in?: number
  }
  // M2M tokens default to 5min in auth-service. Refresh 30s early.
  const ttlSec = body.expires_in ?? 300
  return {
    accessToken: body.access_token,
    expiresAtMs: Date.now() + (ttlSec - 30) * 1000,
  }
}

async function getServiceToken(): Promise<string> {
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.accessToken
  }
  if (inFlight) {
    const t = await inFlight
    return t.accessToken
  }
  inFlight = fetchServiceToken()
  try {
    cached = await inFlight
    return cached.accessToken
  } finally {
    inFlight = null
  }
}

export interface BrainFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
  signal?: AbortSignal
}

export interface BrainResponse<T = unknown> {
  ok: boolean
  status: number
  data: T | null
  error?: string
}

function buildUrl(path: string, query?: BrainFetchOptions['query']): string {
  const url = new URL(path.replace(/^\/+/, '/'), BRAIN_API_URL)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

export async function brainFetch<T = unknown>(
  path: string,
  options: BrainFetchOptions = {},
): Promise<BrainResponse<T>> {
  let token: string
  try {
    token = await getServiceToken()
  } catch (err) {
    return {
      ok: false,
      status: 500,
      data: null,
      error: (err as Error).message,
    }
  }

  const url = buildUrl(path, options.query)
  try {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      cache: 'no-store',
    })
    const text = await res.text()
    let data: T | null = null
    try {
      data = text ? (JSON.parse(text) as T) : null
    } catch {
      // raw text below
    }
    // On 401 the cached token may have been revoked — invalidate and
    // let the next request re-mint.
    if (res.status === 401) {
      cached = null
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error:
          (data && (data as { error?: string }).error) ||
          text.slice(0, 300) ||
          res.statusText,
      }
    }
    return { ok: true, status: res.status, data }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: (err as Error).message,
    }
  }
}
