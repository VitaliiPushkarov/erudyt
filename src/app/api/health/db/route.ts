import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'

export async function GET() {
  try {
    const count = await prisma.dictionaryWord.count()

    const testWord = `__healthcheck__${Date.now()}`
    const created = await prisma.dictionaryWord.create({
      data: {
        word: testWord,
        tags: ['OTHER'],
      },
    })

    await prisma.dictionaryWord.delete({
      where: { id: created.id },
    })

    return NextResponse.json({ ok: true, count })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    )
  }
}
