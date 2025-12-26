import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'
import { normalizeWord } from '@/app/lib/dict/normalize'

const BodySchema = z.object({
  word: z.string().min(1),
  tags: z
    .array(z.enum(['NEOLOGISM', 'ANGLICISM', 'SURZHYK', 'SLANG', 'OTHER']))
    .default(['OTHER']),
  note: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const json = await req.json()
    const body = BodySchema.parse(json)

    const word = normalizeWord(body.word)

    const created = await prisma.dictionaryWord.upsert({
      where: { word },
      update: {
        status: 'ACTIVE',
        tags: body.tags,
        note: body.note,
      },
      create: {
        word,
        tags: body.tags,
        note: body.note,
        status: 'ACTIVE',
      },
    })

    return NextResponse.json({ ok: true, word: created })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 400 }
    )
  }
}
