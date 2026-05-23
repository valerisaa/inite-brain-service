import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/auth/logout
 *
 * Drops the session cookies. The access_token at auth.inite.ai stays
 * valid until its TTL (the OAuth provider owns revocation); this
 * endpoint just severs the brain-landing session.
 */
export async function POST(request: NextRequest) {
  const dest = new URL('/en', request.url)
  const res = NextResponse.redirect(dest)
  res.cookies.set('access_token', '', { path: '/', maxAge: 0 })
  res.cookies.set('refresh_token', '', { path: '/', maxAge: 0 })
  return res
}

export const GET = POST
