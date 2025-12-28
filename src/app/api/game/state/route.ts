export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  if (!id)
    return NextResponse.json(
      { ok: false, error: 'Missing id' },
      { status: 400 }
    )

  const game = await prisma.game.findUnique({ where: { id } })
  if (!game)
    return NextResponse.json(
      { ok: false, error: 'Game not found' },
      { status: 404 }
    )

  return NextResponse.json(
    { ok: true, game: { id: game.id, status: game.status, state: game.state } },
    {
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  )
}
