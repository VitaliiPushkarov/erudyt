export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = (searchParams.get('code') || '').trim()
  if (!code)
    return NextResponse.json(
      { ok: false, error: 'Missing code' },
      { status: 400 }
    )

  const room = await prisma.room.findUnique({
    where: { code },
    include: { players: { orderBy: { createdAt: 'asc' } } },
  })

  if (!room)
    return NextResponse.json(
      { ok: false, error: 'Room not found' },
      { status: 404 }
    )
  return NextResponse.json({ ok: true, room })
}
