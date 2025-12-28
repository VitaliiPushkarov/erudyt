'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const LS = {
  roomCode: 'erudyt_roomCode',
  playerId: 'erudyt_playerId',
  playerName: 'erudyt_playerName',
}

function normalizeRoomCode(input: string) {
  return input.replace(/\D/g, '').slice(0, 6)
}

export default function HomePage() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const [savedRoom, setSavedRoom] = useState<string>('')
  const [savedName, setSavedName] = useState<string>('')

  useEffect(() => {
    const r = localStorage.getItem(LS.roomCode) || ''
    const n = localStorage.getItem(LS.playerName) || ''

    // якщо там старий формат ERU-XXXX — прибираємо, щоб не ламало UX
    if (/^\d{6}$/.test(r)) {
      setSavedRoom(r)
    } else if (r) {
      localStorage.removeItem(LS.roomCode)
    }

    setSavedName(n)
    if (!name && n) setName(n)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canJoin = useMemo(
    () => name.trim().length > 0 && /^\d{6}$/.test(code.trim()),
    [name, code]
  )

  async function joinRoom(roomCode: string, playerName: string) {
    const res = await fetch('/api/room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: roomCode, name: playerName }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `Join failed (${res.status})`)
    }

    const room = data?.room
    const player = data?.player

    if (!room?.code) throw new Error('Join response missing room.code')
    if (!player?.id) throw new Error('Join response missing player.id')

    localStorage.setItem(LS.roomCode, room.code)
    localStorage.setItem(LS.playerId, player.id)
    localStorage.setItem(LS.playerName, player.name ?? '')
    router.push(`/room/${encodeURIComponent(data.room.code)}`)
  }

  async function onCreate() {
    setLoading(true)
    setError('')
    setCode('')
    try {
      const playerName = name.trim()
      if (!playerName) throw new Error('Вкажи імʼя')

      const res = await fetch('/api/room/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Create failed (${res.status})`)
      }

      const roomCode = data.room.code as string // 6 digits
      await joinRoom(roomCode, playerName)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  async function onJoin() {
    setLoading(true)
    setError('')
    try {
      await joinRoom(code.trim(), name.trim())
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  function onContinue() {
    if (!savedRoom) return
    router.push(`/room/${encodeURIComponent(savedRoom)}`)
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        padding: 16,
        maxWidth: 520,
        margin: '0 auto',
      }}
    >
      <div style={{ paddingTop: 12, paddingBottom: 10 }}>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>
          Ерудит
        </div>
        <div style={{ marginTop: 6, color: '#555', fontSize: 14 }}>
          Mobile-first · кімнати · ваш словник
        </div>
      </div>

      {savedRoom ? (
        <section
          style={{
            border: '1px solid #eee',
            borderRadius: 14,
            padding: 14,
            marginTop: 12,
          }}
        >
          <div style={{ fontSize: 13, color: '#666' }}>Швидкий старт</div>
          <div style={{ marginTop: 6, fontWeight: 700 }}>
            Кімната: {savedRoom}
            {savedName ? (
              <span style={{ color: '#666', fontWeight: 500 }}>
                {' '}
                · {savedName}
              </span>
            ) : null}
          </div>
          <button
            onClick={onContinue}
            style={{
              marginTop: 10,
              width: '100%',
              padding: 14,
              borderRadius: 12,
              border: '1px solid #ddd',
              background: '#fff',
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            Продовжити
          </button>
        </section>
      ) : null}

      <section style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#666' }}>Твоє імʼя</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Напр: Віталій"
            style={{
              padding: 14,
              borderRadius: 12,
              border: '1px solid #ddd',
              fontSize: 16,
            }}
            autoComplete="name"
          />
        </label>

        {error ? (
          <div style={{ color: '#b00020', fontSize: 14, marginTop: 2 }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
          <button
            onClick={onCreate}
            disabled={loading || !name.trim()}
            style={{
              width: '100%',
              padding: 14,
              borderRadius: 14,
              border: '1px solid #111',
              background: '#111',
              color: '#fff',
              fontSize: 16,
              fontWeight: 800,
              opacity: loading || !name.trim() ? 0.6 : 1,
            }}
          >
            Створити кімнату
          </button>

          <div
            style={{
              marginTop: 6,
              paddingTop: 14,
              borderTop: '1px solid #eee',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, color: '#666', fontWeight: 700 }}>
              Приєднатись до кімнати
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#666' }}>
                Код кімнати (6 цифр)
              </span>
              <input
                value={code}
                onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
                placeholder="Напр: 123456"
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid #ddd',
                  fontSize: 18,
                  letterSpacing: 2,
                }}
                inputMode="numeric"
                pattern="\\d{6}"
                maxLength={6}
                autoComplete="one-time-code"
              />
            </label>

            <button
              onClick={onJoin}
              disabled={loading || !canJoin}
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 14,
                border: '1px solid #ddd',
                background: '#fff',
                color: '#111',
                fontSize: 16,
                fontWeight: 800,
                opacity: loading || !canJoin ? 0.6 : 1,
              }}
            >
              Приєднатись
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 13, color: '#777' }}>
          Порада: створіть кімнату на одному пристрої, скопіюйте 6‑значний код у
          кімнаті та введіть його на іншому.
        </div>
      </section>
    </main>
  )
}
