export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { normalizeWord } from '@/app/lib/dict/normalize'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const qRaw = searchParams.get('q') ?? ''
    const q = normalizeWord(qRaw)

    const items = await prisma.dictionaryWord.findMany({
      where: q ? { word: { contains: q } } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ ok: true, items })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    )
  }
}
