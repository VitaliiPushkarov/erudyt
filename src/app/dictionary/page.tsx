'use client'

import { useEffect, useMemo, useState } from 'react'

type Tag = 'NEOLOGISM' | 'ANGLICISM' | 'SURZHYK' | 'SLANG' | 'OTHER'

type WordItem = {
  id: string
  word: string
  tags: Tag[]
  note: string | null
  updatedAt: string
  createdAt: string
  status: 'ACTIVE' | 'BANNED'
}

const TAGS: Tag[] = ['NEOLOGISM', 'ANGLICISM', 'SURZHYK', 'SLANG', 'OTHER']

export default function DictionaryPage() {
  const [word, setWord] = useState('')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<Tag[]>(['OTHER'])
  const [q, setQ] = useState('')
  const [items, setItems] = useState<WordItem[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string>('')

  const query = useMemo(() => q.trim(), [q])

  async function fetchList() {
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch(
        `/api/dictionary/search?q=${encodeURIComponent(query)}`
      )
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Search failed')
      setItems(data.items)
    } catch (e: any) {
      setMsg(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addWord() {
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/dictionary/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, tags, note: note || undefined }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Add failed')
      setWord('')
      setNote('')
      await fetchList()
    } catch (e: any) {
      setMsg(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  function toggleTag(t: Tag) {
    setTags((prev) => {
      const has = prev.includes(t)
      const next = has ? prev.filter((x) => x !== t) : [...prev, t]
      return next.length ? next : ['OTHER']
    })
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
        Dictionary
      </h1>

      <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="Нове слово (наприклад: крінж, дедлайн, вайб)"
          style={{ padding: 12, fontSize: 16 }}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Нотатка (опційно)"
          style={{ padding: 12, fontSize: 16 }}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TAGS.map((t) => (
            <button
              key={t}
              onClick={() => toggleTag(t)}
              style={{
                padding: '8px 10px',
                borderRadius: 999,
                border: '1px solid #ddd',
                background: tags.includes(t) ? '#111' : '#fff',
                color: tags.includes(t) ? '#fff' : '#111',
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <button
          onClick={addWord}
          disabled={loading || !word.trim()}
          style={{
            padding: 12,
            fontSize: 16,
            borderRadius: 10,
            border: '1px solid #111',
            background: '#111',
            color: '#fff',
            cursor: 'pointer',
            opacity: loading || !word.trim() ? 0.6 : 1,
          }}
        >
          Add word
        </button>

        {msg ? <div style={{ color: '#b00020' }}>{msg}</div> : null}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Пошук..."
          style={{ padding: 12, fontSize: 16, flex: 1 }}
        />
        <button
          onClick={fetchList}
          disabled={loading}
          style={{
            padding: 12,
            fontSize: 16,
            borderRadius: 10,
            border: '1px solid #ddd',
          }}
        >
          Search
        </button>
      </div>

      <div style={{ opacity: loading ? 0.6 : 1 }}>
        <div style={{ marginBottom: 8, color: '#555' }}>
          Showing: {items.length}
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((it) => (
            <div
              key={it.id}
              style={{
                border: '1px solid #eee',
                borderRadius: 12,
                padding: 12,
                display: 'grid',
                gap: 6,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700 }}>{it.word}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {it.tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: 12,
                      border: '1px solid #ddd',
                      borderRadius: 999,
                      padding: '3px 8px',
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              {it.note ? <div style={{ color: '#444' }}>{it.note}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
