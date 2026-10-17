import { NextRequest } from 'next/server'
import { verifyLtcFirebaseToken } from '@/lib/statementAuth'
import { isAllowedLtcAdviceOrigin } from '@/lib/ltcAdvice'
import { parsePlaceQuery, normalizeGeoapifySuggestions } from '@/lib/ltcPlaces'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Origin',
})
const json = (origin: string, status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' } })

// A per-instance backstop against accidental search loops; Geoapify also enforces
// its own quota. No tokens, search text, user IDs or API responses are logged.
const hits = new Map<string, number[]>()
const isRateLimited = (uid: string) => {
  const now = Date.now()
  const recent = (hits.get(uid) || []).filter((time) => now - time < 60000)
  if (recent.length >= 20) return true
  if (hits.size > 300) hits.clear()
  hits.set(uid, [...recent, now])
  return false
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin') || ''
  if (!isAllowedLtcAdviceOrigin(origin)) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: cors(origin) })
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin') || ''
  if (!isAllowedLtcAdviceOrigin(origin)) return new Response(null, { status: 403 })

  // Signature verification runs before consuming Geoapify API credits.
  let uid: string
  try {
    uid = await verifyLtcFirebaseToken(request.headers.get('authorization'))
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    return json(origin, code === 'AUTH_NOT_CONFIGURED' || code === 'AUTH_KEY_UNAVAILABLE' ? 503 : 401,
      { error: code === 'AUTH_NOT_CONFIGURED' || code === 'AUTH_KEY_UNAVAILABLE'
        ? 'No se pudo verificar tu sesión. Intentá nuevamente.'
        : 'Tu sesión venció. Volvé a iniciar sesión.' })
  }
  let query: string
  try {
    query = parsePlaceQuery(request.nextUrl.searchParams.get('q'))
  } catch {
    return json(origin, 400, { error: 'Escribí entre 3 y 80 caracteres para buscar un lugar.' })
  }
  if (isRateLimited(uid)) return json(origin, 429, { error: 'Muchas búsquedas seguidas. Esperá un minuto.' })
  const apiKey = (process.env.GEOAPIFY_API_KEY || '').trim()
  if (!apiKey) return json(origin, 503, { error: 'La búsqueda de lugares todavía no está configurada. Podés escribir el lugar manualmente.' })

  const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete')
  url.searchParams.set('text', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('lang', 'es')
  url.searchParams.set('limit', '5')

  try {
    // Header authentication avoids leaking the API key through query URLs.
    const external = await fetch(url.toString(), {
      headers: { 'x-api-key': apiKey, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(7500),
    })
    if (external.status === 429) return json(origin, 429, { error: 'La búsqueda alcanzó su límite temporal. Probá más tarde.' })
    if (!external.ok) return json(origin, 502, { error: 'No pudimos consultar lugares. Escribí el lugar manualmente.' })
    const payload: unknown = await external.json()
    return json(origin, 200, { places: normalizeGeoapifySuggestions(payload) })
  } catch {
    return json(origin, 502, { error: 'El buscador de lugares no respondió. Podés ingresar el lugar manualmente.' })
  }
}
