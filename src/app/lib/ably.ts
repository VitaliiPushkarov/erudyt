import Ably from 'ably'

let client: Ably.Realtime | null = null

export function getAblyClient() {
  if (client) return client

  client = new Ably.Realtime({
    authUrl: '/api/ably/token',
    // важливо для мобільних/серверлес
    echoMessages: false,
  })

  return client
}
