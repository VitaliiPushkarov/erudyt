'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

const LS = {
  roomCode: 'erudyt_roomCode',
  playerId: 'erudyt_playerId',
  playerName: 'erudyt_playerName',
}

type Player = { id: string; name: string; createdAt: string }
type Room = { id: string; code: string; players: Player[] }

function normalizeRoomCode(input: string) {
  return input.replace(/\D/g, '').slice(0, 6)
}

export default function RoomPage() {
  const router = useRouter()
  const params = useParams<{ code: string }>()
  const roomCode = useMemo(
    () => normalizeRoomCode((params?.code || '').toString()),
    [params]
  )

  const [room, setRoom] = useState<Room | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [starting, setStarting] = useState(false)

  const playerId =
    typeof window !== 'undefined' ? localStorage.getItem(LS.playerId) : null
  const playerName =
    typeof window !== 'undefined' ? localStorage.getItem(LS.playerName) : null

  async function fetchState() {
    setError('')
    try {
      const res = await fetch(
        `/api/room/state?code=${encodeURIComponent(roomCode)}`,
        { cache: 'no-store' }
      )
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok)
        throw new Error(data?.error || `Failed (${res.status})`)
      setRoom(data.room)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
  }

  useEffect(() => {
    if (roomCode) localStorage.setItem(LS.roomCode, roomCode)
    setLoading(true)
    fetchState().finally(() => setLoading(false))

    const t = setInterval(fetchState, 2000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode])

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomCode)
    } catch {}
  }

  async function startGame() {
    setStarting(true)
    setError('')
    try {
      const res = await fetch('/api/game/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok)
        throw new Error(data?.error || `Start failed (${res.status})`)

      router.push(`/game/${encodeURIComponent(data.gameId)}`)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setStarting(false)
    }
  }

  if (!/^\d{6}$/.test(roomCode)) {
    return (
      <main
        style={{
          minHeight: '100dvh',
          padding: 16,
          maxWidth: 520,
          margin: '0 auto',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 900 }}>
          Невірний код кімнати
        </div>
        <div style={{ marginTop: 8, color: '#666' }}>Код має бути 6 цифр.</div>
        <button
          onClick={() => router.push('/')}
          style={{
            marginTop: 14,
            width: '100%',
            padding: 14,
            borderRadius: 14,
            border: '1px solid #ddd',
            background: '#fff',
            fontWeight: 800,
          }}
        >
          На головну
        </button>
      </main>
    )
  }

  const players = room?.players ?? []
  const canStart = players.length >= 2

  return (
    <main
      style={{
        minHeight: '100dvh',
        padding: 16,
        maxWidth: 520,
        margin: '0 auto',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: '#666' }}>Кімната</div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 2 }}>
            {roomCode}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#666' }}>
            Ти: <span style={{ fontWeight: 700 }}>{playerName || '—'}</span>
          </div>
        </div>

        <button
          onClick={copyCode}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #ddd',
            background: '#fff',
            fontSize: 14,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          Copy
        </button>
      </header>

      <section style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
          Гравці
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {players.map((p) => {
            const isYou = playerId && p.id === playerId
            return (
              <div
                key={p.id}
                style={{
                  border: '1px solid #eee',
                  borderRadius: 14,
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 800 }}>{p.name}</div>
                {isYou ? (
                  <span
                    style={{
                      fontSize: 12,
                      border: '1px solid #111',
                      borderRadius: 999,
                      padding: '4px 8px',
                    }}
                  >
                    you
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 10, fontSize: 13, color: '#777' }}>
          Підключіть другого гравця: введіть цей 6‑значний код на іншому
          телефоні.
        </div>

        {error ? (
          <div style={{ color: '#b00020', fontSize: 14, marginTop: 10 }}>
            {error}
          </div>
        ) : null}
      </section>

      <div
        style={{
          position: 'sticky',
          bottom: 0,
          paddingTop: 14,
          paddingBottom: 14,
          marginTop: 18,
          background:
            'linear-gradient(to top, rgba(255,255,255,1), rgba(255,255,255,0.9), rgba(255,255,255,0))',
        }}
      >
        <button
          onClick={startGame}
          disabled={!canStart || starting}
          style={{
            width: '100%',
            padding: 16,
            borderRadius: 16,
            border: '1px solid #111',
            background: '#111',
            color: '#fff',
            fontSize: 16,
            fontWeight: 900,
            opacity: !canStart || starting ? 0.6 : 1,
          }}
        >
          {canStart
            ? starting
              ? 'Старт…'
              : 'Start game'
            : 'Очікуємо 2 гравців'}
        </button>
      </div>
    </main>
  )
}
