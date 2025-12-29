export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'
import Ably from 'ably'
import { UA_POINTS, isValidUATile } from '@/app/lib/game/ua'
import { BOARD_MULTIPLIERS } from '@/app/lib/game/boardMultipliers'

const BOARD_SIZE = 15
const CENTER = 7

const PlacementSchema = z.object({
  r: z
    .number()
    .int()
    .min(0)
    .max(BOARD_SIZE - 1),
  c: z
    .number()
    .int()
    .min(0)
    .max(BOARD_SIZE - 1),
  ch: z.string().min(1).max(1),
})

const BodySchema = z.object({
  gameId: z.string().min(1),
  playerId: z.string().min(1),
  placements: z.array(PlacementSchema).min(1).max(7),
})

function boardHasAnyTiles(board: (string | null)[][]) {
  for (const row of board) for (const cell of row) if (cell) return true
  return false
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE
}

function collectWord(
  board: (string | null)[][],
  r: number,
  c: number,
  dr: number,
  dc: number
) {
  // move backward to start
  let sr = r,
    sc = c
  while (inBounds(sr - dr, sc - dc) && board[sr - dr][sc - dc]) {
    sr -= dr
    sc -= dc
  }
  // collect forward
  let word = ''
  const cells: { r: number; c: number; ch: string }[] = []
  let cr = sr,
    cc = sc
  while (inBounds(cr, cc) && board[cr][cc]) {
    const ch = board[cr][cc] as string
    word += ch
    cells.push({ r: cr, c: cc, ch })
    cr += dr
    cc += dc
  }
  return { word, cells, start: { r: sr, c: sc }, dr, dc }
}

function scoreWord(word: string) {
  let s = 0
  for (const ch of word) s += UA_POINTS[ch] ?? 0
  return s
}

export async function POST(req: Request) {
  const { gameId, playerId, placements } = BodySchema.parse(await req.json())

  const game = await prisma.game.findUnique({ where: { id: gameId } })
  if (!game)
    return NextResponse.json(
      { ok: false, error: 'Game not found' },
      { status: 404 }
    )

  const state: any = game.state
  if (!state?.board || !state?.racks || !state?.players) {
    return NextResponse.json(
      { ok: false, error: 'Bad game state' },
      { status: 500 }
    )
  }

  // Turn check
  const turnPlayerId = state.turnPlayerId ?? game.turnPlayerId
  if (turnPlayerId !== playerId) {
    return NextResponse.json(
      { ok: false, error: 'Not your turn' },
      { status: 400 }
    )
  }

  // Validate tiles are UA only
  for (const p of placements) {
    if (!isValidUATile(p.ch)) {
      return NextResponse.json(
        { ok: false, error: `Invalid tile: ${p.ch}` },
        { status: 400 }
      )
    }
  }

  // Unique cells
  const keySet = new Set<string>()
  for (const p of placements) {
    const k = `${p.r},${p.c}`
    if (keySet.has(k))
      return NextResponse.json(
        { ok: false, error: 'Duplicate placement cell' },
        { status: 400 }
      )
    keySet.add(k)
  }

  const board = state.board as (string | null)[][]
  const boardHadTiles = boardHasAnyTiles(board)

  const allowMultiDirection = Boolean(
    (state as any)?.rules?.allowMultiDirectionPlacements
  )

  // Cells must be empty
  for (const p of placements) {
    if (board[p.r][p.c]) {
      return NextResponse.json(
        { ok: false, error: 'Cannot place on existing tile' },
        { status: 400 }
      )
    }
  }

  // Rack availability check (counts)
  const rack: string[] = (state.racks[playerId] || []).slice()
  const rackCounts = new Map<string, number>()
  for (const ch of rack)
    if (ch) rackCounts.set(ch, (rackCounts.get(ch) || 0) + 1)
  for (const p of placements) {
    const n = rackCounts.get(p.ch) || 0
    if (n <= 0)
      return NextResponse.json(
        { ok: false, error: `Tile not in rack: ${p.ch}` },
        { status: 400 }
      )
    rackCounts.set(p.ch, n - 1)
  }

  // Determine direction (default Erudyt/Scrabble rule: tiles placed in a turn are collinear)
  const sameRow = placements.every((p) => p.r === placements[0].r)
  const sameCol = placements.every((p) => p.c === placements[0].c)

  if (!sameRow && !sameCol && !allowMultiDirection) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Tiles placed in one turn must be in one row OR one column. Note: you can still create multiple words in one move via crossings.',
      },
      { status: 400 }
    )
  }

  let dr = 0,
    dc = 0

  if (!allowMultiDirection) {
    if (placements.length > 1) {
      if (sameRow) {
        dr = 0
        dc = 1
      } else {
        dr = 1
        dc = 0
      }
    }
  }

  // Apply to a nextBoard
  const nextBoard = board.map((row) => row.slice())
  for (const p of placements) nextBoard[p.r][p.c] = p.ch

  // First move must cover center
  if (!boardHadTiles) {
    const coversCenter = placements.some(
      (p) => p.r === CENTER && p.c === CENTER
    )
    if (!coversCenter) {
      return NextResponse.json(
        { ok: false, error: 'First move must cover center' },
        { status: 400 }
      )
    }
  } else {
    // Must touch existing tile
    const touches = placements.some((p) => {
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
      return dirs.some(
        ([rr, cc]) => inBounds(p.r + rr, p.c + cc) && board[p.r + rr][p.c + cc]
      )
    })
    if (!touches) {
      return NextResponse.json(
        { ok: false, error: 'Move must connect to existing tiles' },
        { status: 400 }
      )
    }
  }

  // If single tile, pick direction that forms a word (prefer longer) — default mode only
  if (!allowMultiDirection && placements.length === 1) {
    const p = placements[0]
    const horiz = collectWord(nextBoard, p.r, p.c, 0, 1)
    const vert = collectWord(nextBoard, p.r, p.c, 1, 0)
    const hl = horiz.word.length
    const vl = vert.word.length
    if (hl <= 1 && vl <= 1) {
      return NextResponse.json(
        { ok: false, error: 'Move must form a word' },
        { status: 400 }
      )
    }
    if (hl >= vl) {
      dr = 0
      dc = 1
    } else {
      dr = 1
      dc = 0
    }
  }

  // Contiguity along main line (no gaps) — default mode only
  if (!allowMultiDirection) {
    if (dr === 0 && dc === 1) {
      const r = placements[0].r
      const minC = Math.min(...placements.map((p) => p.c))
      const maxC = Math.max(...placements.map((p) => p.c))
      for (let c = minC; c <= maxC; c++) {
        if (!nextBoard[r][c]) {
          return NextResponse.json(
            { ok: false, error: 'Gaps in word placement' },
            { status: 400 }
          )
        }
      }
    } else {
      const c = placements[0].c
      const minR = Math.min(...placements.map((p) => p.r))
      const maxR = Math.max(...placements.map((p) => p.r))
      for (let r = minR; r <= maxR; r++) {
        if (!nextBoard[r][c]) {
          return NextResponse.json(
            { ok: false, error: 'Gaps in word placement' },
            { status: 400 }
          )
        }
      }
    }
  }

  function isConnectedPlacements(ps: { r: number; c: number }[]) {
    const set = new Set(ps.map((p) => `${p.r},${p.c}`))
    const q: { r: number; c: number }[] = [ps[0]]
    const seen = new Set<string>([`${ps[0].r},${ps[0].c}`])
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const
    while (q.length) {
      const cur = q.shift()!
      for (const [rr, cc] of dirs) {
        const nr = cur.r + rr
        const nc = cur.c + cc
        const k = `${nr},${nc}`
        if (!set.has(k) || seen.has(k)) continue
        seen.add(k)
        q.push({ r: nr, c: nc })
      }
    }
    return seen.size === set.size
  }

  if (allowMultiDirection) {
    if (placements.length > 1 && !isConnectedPlacements(placements)) {
      return NextResponse.json(
        { ok: false, error: 'Placed tiles must be connected (freestyle mode)' },
        { status: 400 }
      )
    }
  }

  // Collect words (dedupe by span so we never double-count)
  type CollectedWord = {
    word: string
    cells: any[]
    start: { r: number; c: number }
    dr: number
    dc: number
  }

  const wordMap = new Map<string, CollectedWord>()

  function addWord(w: ReturnType<typeof collectWord>) {
    if (!w.word || w.word.length <= 1) return
    const key = `${w.start.r},${w.start.c}:${w.dr},${w.dc}`
    if (!wordMap.has(key)) {
      wordMap.set(key, {
        word: w.word,
        cells: w.cells,
        start: w.start,
        dr: w.dr,
        dc: w.dc,
      })
    }
  }

  if (!allowMultiDirection) {
    const main = collectWord(
      nextBoard,
      placements[0].r,
      placements[0].c,
      dr,
      dc
    )
    addWord(main)

    const crossDr = dr === 0 ? 1 : 0
    const crossDc = dc === 1 ? 0 : 1
    for (const p of placements) {
      const w = collectWord(nextBoard, p.r, p.c, crossDr, crossDc)
      addWord(w)
    }
  } else {
    // Freestyle: allow placing in multiple directions, but still only score/validate
    // words that are actually formed (len > 1) in horizontal/vertical.
    for (const p of placements) {
      addWord(collectWord(nextBoard, p.r, p.c, 0, 1))
      addWord(collectWord(nextBoard, p.r, p.c, 1, 0))
    }
  }

  const words = Array.from(wordMap.values())

  if (words.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Move must form a word' },
      { status: 400 }
    )
  }

  // Dictionary check (expects DictionaryWord.word stored lowercase, apostrophes normalized)
  const norms = Array.from(new Set(words.map((w) => w.word.toLowerCase())))
  const found = await prisma.dictionaryWord.findMany({
    where: { word: { in: norms }, status: 'ACTIVE' },
    select: { word: true },
  })
  const foundSet = new Set(found.map((x) => x.word))
  const missing = norms.filter((w) => !foundSet.has(w))
  if (missing.length) {
    return NextResponse.json(
      { ok: false, error: `Unknown word: ${missing[0]}` },
      { status: 400 }
    )
  }

  // Score with board multipliers
  let score = 0

  for (const w of words) {
    let wordScore = 0
    let wordMultiplier = 1

    for (const cell of w.cells) {
      const base = UA_POINTS[cell.ch] ?? 0
      let letterScore = base

      // apply multipliers ONLY for newly placed tiles
      const isNew = placements.some((p) => p.r === cell.r && p.c === cell.c)

      if (isNew) {
        const m = BOARD_MULTIPLIERS[cell.r][cell.c]
        if (m && 'letter' in m) letterScore *= m.letter
        if (m && 'word' in m) wordMultiplier *= m.word
      }

      wordScore += letterScore
    }

    score += wordScore * wordMultiplier
  }

  // Bingo bonus
  if (placements.length === 7) score += 50

  // Update rack: remove used tiles, refill from bag
  const nextRack = (state.racks[playerId] || []).slice()
  for (const p of placements) {
    const idx = nextRack.findIndex((x: any) => x === p.ch)
    if (idx >= 0) nextRack[idx] = ''
  }
  const nextBag = (state.bag || []).slice()
  for (let i = 0; i < nextRack.length; i++) {
    if (!nextRack[i]) nextRack[i] = nextBag.pop() || ''
  }

  // Next player
  const ids = (state.players as any[]).map((p) => p.id)
  const curIdx = ids.indexOf(playerId)
  const nextTurn = ids[(curIdx + 1) % ids.length] || playerId

  // Update scores
  const nextPlayers = (state.players as any[]).map((p) =>
    p.id === playerId ? { ...p, score: (p.score || 0) + score } : p
  )

  const nextState = {
    ...state,
    board: nextBoard,
    bag: nextBag,
    racks: { ...state.racks, [playerId]: nextRack },
    players: nextPlayers,
    turnPlayerId: nextTurn,
    lastMove: {
      by: playerId,
      placed: placements,
      words: words.map((w) => w.word),
      score,
    },
  }

  // Persist: update game + create move record
  const updated = await prisma.game.update({
    where: { id: gameId },
    data: { state: nextState, turnPlayerId: nextTurn },
    select: { id: true, state: true },
  })

  await prisma.move.create({
    data: {
      gameId,
      playerId,
      score,
      payload: { placements, words: words.map((w) => w.word), score },
    },
  })

  // Ably publish
  const ablyKey = process.env.ABLY_API_KEY
  if (ablyKey) {
    const ably = new Ably.Rest(ablyKey)
    await ably.channels
      .get(`game:${gameId}`)
      .publish('state_updated', { id: gameId, ts: Date.now() })
  }

  return NextResponse.json({
    ok: true,
    score,
    game: { id: updated.id, state: updated.state },
  })
}
