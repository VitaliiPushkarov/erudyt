export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'

const BodySchema = z.object({
  id: z.string().min(1),
  state: z.any(),
})

export async function POST(req: Request) {
  const { id, state } = BodySchema.parse(await req.json())

  const updated = await prisma.game.update({
    where: { id },
    data: { state },
  })

  return NextResponse.json({
    ok: true,
    game: { id: updated.id, state: updated.state },
  })
}
