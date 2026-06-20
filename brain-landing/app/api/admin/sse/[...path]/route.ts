import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/server-auth'

/**
 * /api/admin/sse/[...path] — admin-gated SSE pass-through.
 *
 * Distinct from the standard JSON proxy because EventSource expects
 * `text/event-stream` and the underlying response cannot be
 * `await res.text()`-ed and re-emitted as JSON. We open the upstream
 * connection, mint the same service-side OAuth token used by the JSON
 * proxy, and pipe the body straight to the browser.
 *
 * Allowlist mirrors the JSON proxy but is intentionally narrower —
 * SSE endpoints are a small fixed set. Anything outside the allowlist
 * rejects with 403.
 */

const ALLOWED_PREFIXES = ['v1/admin/traces/stream']

function isAllowed(path: string): boolean {
  const normalized = path.replace(/^\/+/, '').replace(/\?.*$/, '')
  return ALLOWED_PREFIXES.some(
    (p) => normalized === p || normalized.startsWith(p),
  )
}

async function getToken(): Promise<string> {
  const auth = process.env.AUTH_SERVICE_URL || 'https://auth.inite.ai'
  const clientId = process.env.OAUTH_CLIENT_ID || 'brain-landing'
  const clientSecret = process.env.OAUTH_CLIENT_SECRET || ''
  const aud = process.env.BRAIN_AUDIENCE || 'brain'
  const scope =
    process.env.BRAIN_SCOPE || 'brain:read brain:write brain:admin brain:read_pii'
  if (!clientSecret) throw new Error('OAUTH_CLIENT_SECRET is not configured')
  const res = await fetch(`${auth}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: aud,
      scope,
    }).toString(),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`auth-service token mint failed (${res.status})`)
  }
  const body = (await res.json()) as { access_token: string }
  return body.access_token
}

export const GET = withAdmin(async (_session, request) => {
  const u = request.nextUrl
  const prefix = '/api/admin/sse/'
  const subpath = u.pathname.startsWith(prefix)
    ? u.pathname.slice(prefix.length)
    : ''
  if (!isAllowed(subpath)) {
    return NextResponse.json(
      { error: `path '/${subpath}' is not in the SSE allow-list` },
      { status: 403 },
    )
  }
  const target =
    (process.env.BRAIN_API_URL || 'https://brain.inite.ai') +
    `/${subpath}${u.search}`

  let token: string
  try {
    token = await getToken()
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }

  // The browser-side EventSource will abort the upstream fetch when the
  // user navigates away by tearing down the response stream, so we just
  // mirror the body without extra plumbing.
  const upstream = await fetch(target, {
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  })

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}) as unknown as (req: NextRequest) => Promise<NextResponse>
