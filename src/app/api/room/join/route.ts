export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'

const BodySchema = z.object({
  code: z.string().min(3),
  name: z.string().min(1).max(30),
})

export async function POST(req: Request) {
  try {
    const { code, name } = BodySchema.parse(await req.json())
    const room = await prisma.room.findUnique({
      where: { code: code.toUpperCase() },
    })
    if (!room)
      return NextResponse.json(
        { ok: false, error: 'Room not found' },
        { status: 404 }
      )

    const player = await prisma.player.create({
      data: { roomId: room.id, name: name.trim() },
    })

    return NextResponse.json({ ok: true, room, player })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 400 }
    )
  }
}
