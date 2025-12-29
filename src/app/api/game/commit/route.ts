export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        'Commit endpoint is disabled. Use /api/game/move to make a validated move.',
    },
    { status: 400 }
  )
}
