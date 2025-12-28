export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'
import Ably from 'ably'

const BodySchema = z.object({
  id: z.string().min(1),
  state: z.any(),
})

export async function POST(req: Request) {
  const { id, state } = BodySchema.parse(await req.json())

  const updated = await prisma.game.update({
    where: { id },
    data: { state },
    select: { id: true, state: true },
  })

  let published = false
  const ablyKey = process.env.ABLY_API_KEY
  if (ablyKey) {
    const ably = new Ably.Rest(ablyKey)
    const channel = ably.channels.get(`game:${id}`)
    await channel.publish('state_updated', { id, ts: Date.now() })
    published = true
  }

  return NextResponse.json({
    ok: true,
    published,
    game: { id: updated.id, state: updated.state },
  })
}
