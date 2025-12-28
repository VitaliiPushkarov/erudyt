export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'

const BodySchema = z.object({
  roomCode: z.string().regex(/^\d{6}$/, 'Room code must be 6 digits'),
})

const BOARD_SIZE = 15

function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null as string | null)
  )
}

// MVP bag: UA + EN uppercase, simplified distribution
function makeBag() {
  const ua = 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ'
  const en = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const letters = (ua + en).split('')
  const bag: string[] = []
  for (const ch of letters) {
    // light distribution: 2 of each
    bag.push(ch, ch)
  }
  // shuffle
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

function draw(bag: string[], n: number) {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const x = bag.pop()
    if (!x) break
    out.push(x)
  }
  return out
}

export async function POST(req: Request) {
  const { roomCode } = BodySchema.parse(await req.json())

  const room = await prisma.room.findUnique({
    where: { code: roomCode },
    include: { players: { orderBy: { createdAt: 'asc' } } },
  })
  if (!room)
    return NextResponse.json(
      { ok: false, error: 'Room not found' },
      { status: 404 }
    )
  if (room.players.length < 2)
    return NextResponse.json(
      { ok: false, error: 'Need 2 players' },
      { status: 400 }
    )

  const bag = makeBag()

  const players = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    score: 0,
  }))

  const racks: Record<string, string[]> = {}
  for (const p of room.players) {
    racks[p.id] = draw(bag, 7)
  }

  const state = {
    v: 1,
    board: emptyBoard(),
    bag,
    players,
    racks,
    turnPlayerId: room.players[0].id,
    lastMove: null as null | {
      by: string
      placed: { r: number; c: number; ch: string }[]
    },
  }

  const game = await prisma.game.create({
    data: {
      roomId: room.id,
      status: 'IN_PROGRESS',
      state,
    },
  })

  return NextResponse.json({ ok: true, gameId: game.id })
}
