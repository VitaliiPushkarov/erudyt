export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import Ably from 'ably'

export async function GET(req: Request) {
  const key = process.env.ABLY_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'Missing ABLY_API_KEY' }, { status: 500 })
  }

  // Optional: allow passing a clientId from the browser (safe; Ably will embed it in the token)
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId') || 'erudyt-client'

  const rest = new Ably.Rest(key)
  const tokenRequest = await rest.auth.createTokenRequest({ clientId })

  return NextResponse.json(tokenRequest, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
