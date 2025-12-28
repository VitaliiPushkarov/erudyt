export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'

function makeCode6() {
  // 6 digits, first digit not 0
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST() {
  for (let i = 0; i < 12; i++) {
    const code = makeCode6()
    try {
      const room = await prisma.room.create({ data: { code } })
      return NextResponse.json({ ok: true, room })
    } catch {
      // collision -> retry
    }
  }

  return NextResponse.json(
    { ok: false, error: 'Failed to create room' },
    { status: 500 }
  )
}
