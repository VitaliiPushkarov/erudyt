export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'

const BodySchema = z.object({
  roomCode: z.string().regex(/^\d{6}$/, 'Room code must be 6 digits'),
})

export async function POST(req: Request) {
  const { roomCode } = BodySchema.parse(await req.json())

  const room = await prisma.room.findUnique({
    where: { code: roomCode },
    include: { players: true },
  })
  if (!room)
    return NextResponse.json(
      { ok: false, error: 'Room not found' },
      { status: 404 }
    )
  if (room.players.length < 2)
    return NextResponse.json(
      { ok: false, error: 'Need 2 players' },
      { status: 400 }
    )

  const game = await prisma.game.create({
    data: {
      roomId: room.id,
      status: 'IN_PROGRESS',
      state: { v: 1, note: 'stub' },
    },
  })

  return NextResponse.json({ ok: true, gameId: game.id })
}
