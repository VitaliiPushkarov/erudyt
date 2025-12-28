export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'

function makeCode() {
  const part = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `ERU-${part}`
}

export async function POST() {
  // робимо кілька спроб на випадок колізії
  for (let i = 0; i < 5; i++) {
    const code = makeCode()
    try {
      const room = await prisma.room.create({ data: { code } })
      return NextResponse.json({ ok: true, room })
    } catch {}
  }
  return NextResponse.json(
    { ok: false, error: 'Failed to create room' },
    { status: 500 }
  )
}
