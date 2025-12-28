'use client'
import { getAblyClient } from '@/app/lib/ably'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

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

  const playerId =
    typeof window !== 'undefined' ? localStorage.getItem(LS.playerId) : null
  const playerName =
    typeof window !== 'undefined' ? localStorage.getItem(LS.playerName) : null

  const meId = playerId || ''
  const myRack = state?.racks?.[meId] ?? []

  async function fetchGame() {
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
    }
  }
  useEffect(() => {
    if (!gameId) return

    // 1) початкове завантаження
    fetchGame()

    // 2) realtime subscribe
    const ably = getAblyClient()
    const channel = ably.channels.get(`game:${gameId}`)

    const handler = () => {
      fetchGame()
    }

    channel.subscribe('state_updated', handler)

    return () => {
      channel.unsubscribe('state_updated', handler)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])
  useEffect(() => {
    if (!gameId) return
    setLoading(true)
    fetchGame().finally(() => setLoading(false))
    const t = setInterval(fetchGame, 2500)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  const isMyTurn =
    state?.turnPlayerId && meId ? state.turnPlayerId === meId : false

  function rackLetter(i: number) {
    return myRack[i] ?? null
  }

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

  async function commitTurn() {
    if (!state) return
    if (!isMyTurn) return
    if (pending.length === 0) return

    setSaving(true)
    setError('')
    try {
      // apply pending to board
      const nextBoard = state.board.map((row) => row.slice())
      for (const p of pending) nextBoard[p.r][p.c] = p.ch

      // remove used rack letters
      const nextRack = myRack.slice()
      for (const p of pending) nextRack[p.fromRackIndex] = '' // mark empty

      // draw replacements
      const nextBag = state.bag.slice()
      const refill: string[] = []
      for (let i = 0; i < nextRack.length; i++) {
        if (!nextRack[i]) {
          const x = nextBag.pop()
          refill.push(x || '')
          nextRack[i] = x || ''
        }
      }

      // determine next turn player (simple round-robin)
      const ids = state.players.map((p) => p.id)
      const idx = ids.indexOf(state.turnPlayerId)
      const nextTurn = ids[(idx + 1) % ids.length] || state.turnPlayerId

      const nextState: GameState = {
        ...state,
        board: nextBoard,
        bag: nextBag,
        racks: { ...state.racks, [meId]: nextRack },
        turnPlayerId: nextTurn,
        lastMove: {
          by: meId,
          placed: pending.map(({ r, c, ch }) => ({ r, c, ch })),
        },
      }

      const res = await fetch('/api/game/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gameId, state: nextState }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok)
        throw new Error(data?.error || `Commit failed (${res.status})`)

      await fetchGame()
      clearPending()
    } catch (e: any) {
      setError(e?.message ?? String(e))
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

      {/* BOARD (mobile-first: scrollable) */}
      <div
        style={{
          border: '1px solid #eee',
          borderRadius: 14,
          overflow: 'hidden',
          background: '#fff',
        }}
      >
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ width: 15 * 34, padding: 8 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${size}, 32px)`,
                gap: 2,
              }}
            >
              {state.board.map((row, r) =>
                row.map((cell, c) => {
                  const pend = cellHasPending(r, c)
                  const ch = pend?.ch ?? cell
                  const isSelectedCell = Boolean(pend)
                  return (
                    <button
                      key={`${r}-${c}`}
                      onClick={() => onTapCell(r, c)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        border: '1px solid #ddd',
                        background: ch
                          ? isSelectedCell
                            ? '#111'
                            : '#f7f7f7'
                          : '#fff',
                        color: ch ? (isSelectedCell ? '#fff' : '#111') : '#999',
                        fontWeight: 900,
                        fontSize: 14,
                        padding: 0,
                        cursor: 'pointer',
                      }}
                      aria-label={`cell ${r + 1}-${c + 1}`}
                    >
                      {ch ?? ''}
                    </button>
                  )
                })
              )}
            </div>
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
                {ch || ''}
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
          onClick={commitTurn}
          disabled={!isMyTurn || saving || pending.length === 0}
          style={{
            width: '100%',
            padding: 16,
            borderRadius: 16,
            border: '1px solid #111',
            background: '#111',
            color: '#fff',
            fontSize: 16,
            fontWeight: 900,
            opacity: !isMyTurn || saving || pending.length === 0 ? 0.55 : 1,
          }}
        >
          {pending.length === 0
            ? 'Зроби хід'
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
    </main>
  )
}
