export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'

const BodySchema = z.object({
  name: z.string().min(1).max(30),
})

function random6Digits() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST(req: Request) {
  try {
    const { name } = BodySchema.parse(await req.json())

    // пробуємо створити кімнату з унікальним кодом
    for (let attempt = 0; attempt < 30; attempt++) {
      const code = random6Digits()

      try {
        const room = await prisma.room.create({
          data: { code },
        })

        const player = await prisma.player.create({
          data: {
            roomId: room.id,
            name: name.trim(),
          },
        })

        return NextResponse.json({
          ok: true,
          room,
          player,
          playerId: player.id,
        })
      } catch (e: any) {
        // Prisma unique constraint (P2002) — повторюємо генерацію
        if (e?.code === 'P2002') continue
        throw e
      }
    }

    return NextResponse.json(
      { ok: false, error: 'Failed to generate room code' },
      { status: 500 }
    )
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 400 }
    )
  }
}
