export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'
import { DictionaryTag } from '@prisma/client'
import { normalizeWord } from '@/app/lib/dict/normalize'

const BodySchema = z.object({
  word: z.string().min(1),
  tags: z.array(z.nativeEnum(DictionaryTag)).optional(),
  note: z.string().optional(),
})

function serializeError(e: unknown) {
  const anyErr = e as any
  const base =
    anyErr instanceof Error
      ? { name: anyErr.name, message: anyErr.message, stack: anyErr.stack }
      : { name: anyErr?.name, message: anyErr?.message, value: anyErr }

  // Prisma часто має code/meta
  return {
    ...base,
    code: anyErr?.code,
    meta: anyErr?.meta,
  }
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json())

    const word = normalizeWord(body.word)
    const tags: DictionaryTag[] = body.tags?.length
      ? body.tags
      : [DictionaryTag.OTHER]

    const created = await prisma.dictionaryWord.upsert({
      where: { word },
      update: { status: 'ACTIVE', tags, note: body.note },
      create: { word, tags, note: body.note, status: 'ACTIVE' },
    })

    return NextResponse.json({ ok: true, word: created })
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request', details: e.flatten() },
        { status: 400 }
      )
    }

    const info = serializeError(e)
    console.error('dictionary/add failed:', info)

    return NextResponse.json(
      {
        ok: false,
        error: info.message || info.name || 'Unknown server error',
        info,
      },
      { status: 500 }
    )
  }
}
