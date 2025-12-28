export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import Ably from 'ably'

export async function GET() {
  const key = process.env.ABLY_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'Missing ABLY_API_KEY' }, { status: 500 })
  }

  const rest = new Ably.Rest(key)
  const tokenRequest = await rest.auth.createTokenRequest({
    clientId: 'erudyt-client',
  })

  return NextResponse.json(tokenRequest, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
