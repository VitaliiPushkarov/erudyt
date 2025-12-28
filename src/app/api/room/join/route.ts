export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'

const BodySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Room code must be 6 digits'),
  name: z.string().min(1).max(30),
})

export async function POST(req: Request) {
  try {
    const { code, name } = BodySchema.parse(await req.json())
    const trimmedName = name.trim()

    const room = await prisma.room.findUnique({
      where: { code },
    })

    if (!room) {
      return NextResponse.json(
        { ok: false, error: 'Room not found' },
        { status: 404 }
      )
    }

    // If a player with the same name already exists in this room, reuse it.
    // This prevents accidental duplicates (e.g., refresh/auto-join/double-tap) in MVP mode.
    const existingPlayer = await prisma.player.findFirst({
      where: {
        roomId: room.id,
        name: trimmedName,
      },
    })

    const player =
      existingPlayer ??
      (await prisma.player.create({
        data: {
          roomId: room.id,
          name: trimmedName,
        },
      }))

    return NextResponse.json({
      ok: true,
      room,
      player,
      playerId: player.id,
      reused: Boolean(existingPlayer),
    })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 400 }
    )
  }
}
