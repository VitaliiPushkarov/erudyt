export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'

export async function GET() {
  const db = await prisma.$queryRaw<{ current_database: string }[]>`
    SELECT current_database() as current_database
  `
  const count = await prisma.dictionaryWord.count()

  return NextResponse.json({
    ok: true,
    currentDatabase: db?.[0]?.current_database ?? null,
    dictionaryCount: count,
  })
}
