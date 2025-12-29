'use client'
import { getAblyClient } from '@/app/lib/ably'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { UA_POINTS } from '@/app/lib/game/ua'
import { BOARD_MULTIPLIERS } from '@/app/lib/game/boardMultipliers'

const LS = {
  playerId: 'erudyt_playerId',
  playerName: 'erudyt_playerName',
}

type GameState = {
  v: number
  board: (string | null)[][]
  bag: string[]
  players: { id: string; name: string; score: number }[]
  racks: Record<string, string[]>
  turnPlayerId: string
  lastMove: null | {
    by: string
    placed: { r: number; c: number; ch: string }[]
  }
}

type Pending = { r: number; c: number; ch: string; fromRackIndex: number }

export default function GamePage() {
  const [showYourTurn, setShowYourTurn] = useState(false)

  type PreviewWord = { word: string; score: number }
  type BonusCell = { r: number; c: number; label: string }
  type MovePreview = { total: number; words: PreviewWord[]; bonus: BonusCell[] }

  const [confirm, setConfirm] = useState<MovePreview | null>(null)
  const [flashCells, setFlashCells] = useState<Set<string>>(new Set())
  const [errorModal, setErrorModal] = useState<string | null>(null)
  const params = useParams<{ id: string }>()
  const gameId = useMemo(() => (params?.id || '').toString(), [params])

  const [state, setState] = useState<GameState | null>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [selectedRackIndex, setSelectedRackIndex] = useState<number | null>(
    null
  )

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>('')
  const [previewing, setPreviewing] = useState(false)

  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState<string | null>(null)

  const meId = playerId || ''
  const myRack = state?.racks?.[meId] ?? []

  async function fetchGame() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/game/state?id=${encodeURIComponent(gameId)}&t=${Date.now()}`,
        {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        }
      )
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok)
        throw new Error(data?.error || `Failed (${res.status})`)
      setState(data.game.state)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (typeof window === 'undefined') return
    setPlayerId(localStorage.getItem(LS.playerId))
    setPlayerName(localStorage.getItem(LS.playerName))
  }, [])

  useEffect(() => {
    if (!gameId) return

    // 1) початкове завантаження
    fetchGame()

    // 2) realtime subscribe + fallback polling
    const ably = getAblyClient()
    const channel = ably.channels.get(`game:${gameId}`)

    const handler = (msg: any) => {
      console.log('[Ably] state_updated', msg?.data)
      fetchGame()
    }

    channel.subscribe('state_updated', handler)

    const interval = setInterval(fetchGame, 15000)

    return () => {
      channel.unsubscribe('state_updated', handler)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  const isMyTurn =
    state?.turnPlayerId && meId ? state.turnPlayerId === meId : false

  function rackLetter(i: number) {
    return myRack[i] ?? null
  }
  useEffect(() => {
    if (!state || !meId) return

    if (state.turnPlayerId === meId) {
      setShowYourTurn(true)
      const t = setTimeout(() => setShowYourTurn(false), 2500)
      return () => clearTimeout(t)
    }
  }, [state?.turnPlayerId, meId])

  useEffect(() => {
    if (errorModal) setErrorModal(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length])
  function cellHasPending(r: number, c: number) {
    return pending.find((p) => p.r === r && p.c === c) || null
  }

  function onTapRack(i: number) {
    if (!isMyTurn) return
    if (!rackLetter(i)) return
    setSelectedRackIndex((prev) => (prev === i ? null : i))
  }

  function onTapCell(r: number, c: number) {
    if (!state) return
    if (!isMyTurn) return

    // If already placed this turn: remove it (return to rack)
    const p = cellHasPending(r, c)
    if (p) {
      setPending((prev) => prev.filter((x) => !(x.r === r && x.c === c)))
      return
    }

    // Can't place on existing tile
    if (state.board[r][c]) return

    // Need a selected rack tile
    if (selectedRackIndex === null) return
    const ch = rackLetter(selectedRackIndex)
    if (!ch) return

    // Prevent using same rack tile twice in pending
    if (pending.some((x) => x.fromRackIndex === selectedRackIndex)) return

    setPending((prev) => [
      ...prev,
      { r, c, ch, fromRackIndex: selectedRackIndex },
    ])
    setSelectedRackIndex(null)
  }

  function clearPending() {
    setPending([])
    setSelectedRackIndex(null)
  }

  function collectWordLocal(
    board: (string | null)[][],
    r0: number,
    c0: number,
    dr: 0 | 1,
    dc: 0 | 1
  ) {
    // move to start
    let r = r0
    let c = c0
    while (board[r - dr]?.[c - dc]) {
      r -= dr
      c -= dc
    }

    const start = { r, c }
    const cells: { r: number; c: number; ch: string }[] = []
    let word = ''

    while (board[r]?.[c]) {
      const ch = board[r][c] as string
      word += ch
      cells.push({ r, c, ch })
      r += dr
      c += dc
    }

    return { word, cells, start, dr, dc }
  }

  function buildMovePreview(): MovePreview {
    if (!state) return { total: 0, words: [], bonus: [] }
    if (!meId) return { total: 0, words: [], bonus: [] }
    if (pending.length === 0) return { total: 0, words: [], bonus: [] }

    // nextBoard = board + pending
    const nextBoard = state.board.map((row) => row.slice())
    for (const p of pending) nextBoard[p.r][p.c] = p.ch

    const placedSet = new Set(pending.map((p) => `${p.r},${p.c}`))

    // Collect words (freestyle): for each placed tile, try horizontal + vertical, dedupe by span
    const wordMap = new Map<
      string,
      {
        word: string
        cells: { r: number; c: number; ch: string }[]
        start: { r: number; c: number }
        dr: 0 | 1
        dc: 0 | 1
      }
    >()

    const addWord = (w: ReturnType<typeof collectWordLocal>) => {
      if (!w.word || w.word.length <= 1) return
      const key = `${w.start.r},${w.start.c}:${w.dr},${w.dc}`
      if (!wordMap.has(key)) wordMap.set(key, w)
    }

    for (const p of pending) {
      addWord(collectWordLocal(nextBoard, p.r, p.c, 0, 1)) // horiz
      addWord(collectWordLocal(nextBoard, p.r, p.c, 1, 0)) // vert
    }

    const wordsRaw = Array.from(wordMap.values())

    // Score per word using multipliers only for newly placed tiles
    const words: PreviewWord[] = []
    let total = 0

    for (const w of wordsRaw) {
      let wordScore = 0
      let wordMul = 1

      for (const cell of w.cells) {
        const base = UA_POINTS[cell.ch] ?? 0
        let letterScore = base

        const isNew = placedSet.has(`${cell.r},${cell.c}`)
        if (isNew) {
          const m = BOARD_MULTIPLIERS[cell.r][cell.c]
          if (m && 'letter' in m) letterScore *= m.letter
          if (m && 'word' in m) wordMul *= m.word
        }

        wordScore += letterScore
      }

      const scored = wordScore * wordMul
      total += scored
      words.push({ word: w.word, score: scored })
    }

    // Bingo preview
    if (pending.length === 7) total += 50

    // Bonus cells used this move
    const bonus: BonusCell[] = []
    for (const p of pending) {
      const m = BOARD_MULTIPLIERS[p.r][p.c]
      if (!m) continue
      if (m && 'word' in m) bonus.push({ r: p.r, c: p.c, label: `${m.word}×С` })
      if (m && 'letter' in m)
        bonus.push({ r: p.r, c: p.c, label: `${m.letter}×Б` })
    }

    words.sort((a, b) => b.score - a.score)

    return { total, words, bonus }
  }
  useEffect(() => {
    if (!state?.lastMove?.placed) return
    const s = new Set(state.lastMove.placed.map((p) => `${p.r},${p.c}`))
    setFlashCells(s)
    const t = setTimeout(() => setFlashCells(new Set()), 1200)
    return () => clearTimeout(t)
  }, [state?.lastMove?.by, state?.lastMove?.placed])
  async function openConfirm() {
    if (!state) return
    if (!isMyTurn) return
    if (!meId) return
    if (pending.length === 0) return

    setPreviewing(true)
    setError('')
    try {
      const placements = pending.map(({ r, c, ch }) => ({ r, c, ch }))

      const res = await fetch('/api/game/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId,
          playerId: meId,
          placements,
          previewOnly: true,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Помилка перевірки ходу')
      }

      setConfirm(data.preview)
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      setError(msg)
      setErrorModal(msg)
    } finally {
      setPreviewing(false)
    }
  }

  async function commitTurn() {
    if (!state) return
    if (!isMyTurn) return
    if (pending.length === 0) return
    if (!meId) return

    setSaving(true)
    setError('')
    try {
      const placements = pending.map(({ r, c, ch }) => ({ r, c, ch }))

      const res = await fetch('/api/game/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, playerId: meId, placements }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok)
        throw new Error(data?.error || `Move failed (${res.status})`)

      setState(data.game.state)
      clearPending()
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      setError(msg)
      setErrorModal(msg)
    } finally {
      setSaving(false)
    }
  }

  if (!state) {
    return (
      <main
        style={{
          minHeight: '100dvh',
          padding: 16,
          maxWidth: 520,
          margin: '0 auto',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900 }}>Game</div>
        <div style={{ marginTop: 10, color: '#666' }}>
          {loading ? 'Loading…' : 'No state'}
        </div>
        {error ? (
          <div style={{ marginTop: 10, color: '#b00020' }}>{error}</div>
        ) : null}
      </main>
    )
  }

  const size = state.board.length
  const CENTER = 7

  return (
    <main
      style={{
        minHeight: '100dvh',
        padding: 12,
        maxWidth: 520,
        margin: '0 auto',
      }}
    >
      <header style={{ padding: 4, paddingBottom: 10 }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}
        >
          <div>
            <div style={{ fontSize: 12, color: '#666' }}>Game</div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              {gameId.slice(0, 8)}…
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#666' }}>Turn</div>
            <div style={{ fontSize: 14, fontWeight: 900 }}>
              {state.players.find((p) => p.id === state.turnPlayerId)?.name ??
                '—'}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            color: isMyTurn ? '#0a7a2f' : '#666',
            fontWeight: 800,
          }}
        >
          {meId
            ? isMyTurn
              ? 'Твій хід'
              : 'Чекаємо…'
            : 'Нема playerId (зайди через кімнату)'}
        </div>

        {error ? (
          <div style={{ marginTop: 8, color: '#b00020', fontSize: 13 }}>
            {error}
          </div>
        ) : null}
      </header>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {state.players.map((p) => (
          <div
            key={p.id}
            style={{
              border: '1px solid #eee',
              borderRadius: 999,
              padding: '6px 10px',
              fontSize: 13,
            }}
          >
            <b>{p.name}</b>: {p.score}
          </div>
        ))}
      </div>
      {/* BOARD (mobile-first: scrollable) */}
      <div
        style={{
          border: '1px solid #eee',
          borderRadius: 14,
          overflow: 'hidden',
          background: '#fff',
          width: '100%',
        }}
      >
        <div
          style={{
            padding: 8,
            // responsive cell size: fits board into viewport (no horizontal scroll)
            // 56px is a safety padding budget (page padding + borders + gaps)
            ['--cell' as any]: 'clamp(20px, calc((100vw - 56px) / 15), 32px)',
            ['--gap' as any]: 'clamp(1px, calc(var(--cell) * 0.06), 2px)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${size}, var(--cell))`,
              gap: 'var(--gap)',
              justifyContent: 'center',
            }}
          >
            {state.board.map((row, r) =>
              row.map((cell, c) => {
                const pend = cellHasPending(r, c)
                const ch = pend?.ch ?? cell
                const isSelectedCell = Boolean(pend)
                const isCenter = r === CENTER && c === CENTER
                const showCenterMark = isCenter && !ch

                const mult = BOARD_MULTIPLIERS[r][c]

                let bg = '#ffffff'
                let label: string | null = null

                if (!ch && mult) {
                  if ('word' in mult && mult.word === 3) {
                    bg = '#fecaca' // TW soft red
                    label = '3×С'
                  } else if ('word' in mult && mult.word === 2) {
                    bg = '#fbcfe8' // DW soft pink
                    label = '2×С'
                  } else if ('letter' in mult && mult.letter === 3) {
                    bg = '#bfdbfe' // TL soft blue
                    label = '3×Б'
                  } else if ('letter' in mult && mult.letter === 2) {
                    bg = '#dbeafe' // DL very light blue
                    label = '2×Б'
                  }
                }

                if (showCenterMark) {
                  bg = '#fde68a'
                  label = '★'
                }

                const isPendingHere = Boolean(pend)
                const isBonusHere = isPendingHere && Boolean(mult)
                const isFlash = flashCells.has(`${r},${c}`)

                return (
                  <button
                    key={`${r}-${c}`}
                    onClick={() => onTapCell(r, c)}
                    style={{
                      width: 'var(--cell)',
                      height: 'var(--cell)',
                      borderRadius: 'calc(var(--cell) * 0.18)',
                      border: '1px solid #ddd',
                      background: ch
                        ? isSelectedCell
                          ? '#1f2937'
                          : '#fffbeb'
                        : bg,
                      boxShadow: isBonusHere
                        ? '0 0 0 2px rgba(17,24,39,0.28), 0 8px 16px rgba(17,24,39,0.12)'
                        : isFlash
                        ? '0 0 0 2px rgba(16,185,129,0.45), 0 10px 18px rgba(16,185,129,0.18)'
                        : undefined,
                      color: ch
                        ? isSelectedCell
                          ? '#fff'
                          : '#111827'
                        : '#6b7280',
                      fontWeight: ch ? 900 : 700,
                      fontSize: 'calc(var(--cell) * 0.45)',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                    aria-label={`cell ${r + 1}-${c + 1}`}
                  >
                    {ch ? (
                      ch
                    ) : label ? (
                      <span
                        style={{
                          fontSize: 'calc(var(--cell) * 0.28)',
                          fontWeight: 700,
                          color: '#374151',
                          opacity: label === '★' ? 0.45 : 0.7,
                          lineHeight: 1,
                        }}
                      >
                        {label}
                      </span>
                    ) : (
                      ''
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* RACK */}
      <section style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>
          Твої літери{' '}
          {playerName ? (
            <span style={{ color: '#666', fontWeight: 700 }}>
              · {playerName}
            </span>
          ) : null}
        </div>

        <div
          style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}
        >
          {Array.from({ length: 7 }).map((_, i) => {
            const ch = rackLetter(i)
            const selected = selectedRackIndex === i
            const used = pending.some((p) => p.fromRackIndex === i)

            return (
              <button
                key={i}
                onClick={() => onTapRack(i)}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 12,
                  border: '1px solid #ddd',
                  background: selected ? '#111' : '#fff',
                  color: selected ? '#fff' : '#111',
                  fontSize: 18,
                  fontWeight: 900,
                  opacity: used ? 0.3 : 1,
                  cursor: ch && !used ? 'pointer' : 'default',
                }}
              >
                {ch ? (
                  <div style={{ display: 'grid', lineHeight: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{ch}</div>
                    <div
                      style={{ fontSize: 10, color: '#666', fontWeight: 800 }}
                    >
                      {UA_POINTS[ch] ?? 0}
                    </div>
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: '#777' }}>
          Тапни літеру → тапни клітинку. Тап по поставленій цього ходу —
          прибирає.
        </div>
      </section>

      {/* Sticky actions */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          paddingTop: 12,
          paddingBottom: 14,
          marginTop: 14,
          background:
            'linear-gradient(to top, rgba(255,255,255,1), rgba(255,255,255,0.92), rgba(255,255,255,0))',
        }}
      >
        <button
          onClick={openConfirm}
          disabled={!isMyTurn || saving || previewing || pending.length === 0}
          style={{
            width: '100%',
            padding: 16,
            borderRadius: 16,
            border: '1px solid #111',
            background: '#111',
            color: '#fff',
            fontSize: 16,
            fontWeight: 900,
            opacity:
              !isMyTurn || saving || previewing || pending.length === 0
                ? 0.55
                : 1,
          }}
        >
          {pending.length === 0
            ? 'Зроби хід'
            : previewing
            ? 'Перевіряю…'
            : saving
            ? 'Зберігаю…'
            : `Завершити хід (${pending.length})`}
        </button>

        <button
          onClick={clearPending}
          disabled={pending.length === 0}
          style={{
            width: '100%',
            marginTop: 10,
            padding: 12,
            borderRadius: 14,
            border: '1px solid #ddd',
            background: '#fff',
            fontSize: 14,
            fontWeight: 800,
            opacity: pending.length === 0 ? 0.6 : 1,
          }}
        >
          Скасувати розстановку
        </button>
      </div>
      {showYourTurn && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#111827',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 800,
            zIndex: 50,
            boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
          }}
        >
          Ваш хід
        </div>
      )}
      {confirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setConfirm(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 16,
              maxWidth: 360,
              width: '100%',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, textAlign: 'center' }}>
              Підтвердити хід
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 14,
                textAlign: 'center',
                color: '#374151',
              }}
            >
              За цей хід: <b>+{confirm.total}</b> балів
            </div>

            <div
              style={{
                marginTop: 12,
                border: '1px solid #eee',
                borderRadius: 12,
                padding: 10,
                maxHeight: 170,
                overflow: 'auto',
              }}
            >
              {confirm.words.length === 0 ? (
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  (Слова не утворились — перевір розстановку)
                </div>
              ) : (
                confirm.words.map((w, i) => (
                  <div
                    key={`${w.word}-${i}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '6px 0',
                      borderTop: i === 0 ? 'none' : '1px solid #f2f2f2',
                      fontSize: 14,
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{w.word}</div>
                    <div style={{ color: '#111827', fontWeight: 900 }}>
                      +{w.score}
                    </div>
                  </div>
                ))
              )}
            </div>

            {confirm.bonus.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                Бонуси: {confirm.bonus.map((b) => b.label).join(' · ')}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={() => setConfirm(null)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid #ddd',
                  background: '#fff',
                  fontWeight: 800,
                }}
              >
                Ні
              </button>
              <button
                onClick={() => {
                  setConfirm(null)
                  commitTurn()
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid #111',
                  background: '#111',
                  color: '#fff',
                  fontWeight: 900,
                }}
              >
                Так
              </button>
            </div>
          </div>
        </div>
      )}
      {errorModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: 16,
          }}
          onClick={() => setErrorModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 16,
              maxWidth: 360,
              width: '100%',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 900, textAlign: 'center' }}>
              Помилка ходу
            </div>

            <div style={{ marginTop: 10, fontSize: 14, color: '#374151' }}>
              {errorModal}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={() => setErrorModal(null)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid #ddd',
                  background: '#fff',
                  fontWeight: 800,
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
