import Ably from 'ably'

let client: Ably.Realtime | null = null

function getClientId() {
  const key = 'erudyt_ably_clientId'
  let id = typeof window !== 'undefined' ? localStorage.getItem(key) : null
  if (!id && typeof window !== 'undefined') {
    id =
      (crypto as any)?.randomUUID?.() ||
      `c_${Math.random().toString(16).slice(2)}`
    localStorage.setItem(key, id as string)
  }
  return id || 'server'
}

export function getAblyClient() {
  if (client) return client

  const clientId = getClientId()

  client = new Ably.Realtime({
    authUrl: `/api/ably/token?clientId=${encodeURIComponent(clientId)}`,
    authMethod: 'GET',
    echoMessages: false,
  })

  client.connection.on((s) => {
    console.log('[Ably]', s.current, s.reason?.message || '')
  })

  return client
}
