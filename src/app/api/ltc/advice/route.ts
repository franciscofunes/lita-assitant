import { NextRequest } from 'next/server'
import { verifyLtcFirebaseToken } from '@/lib/statementAuth'
import { buildLtcAdviceChatPayload, isAllowedLtcAdviceOrigin, parseLtcAdvicePrompt } from '@/lib/ltcAdvice'
import { POST as runExistingLitaChat } from '@/app/api/chat/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BODY_BYTES = 4096
const recentCalls = new Map<string, number[]>()

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Origin',
})

const jsonError = (origin: string, status: number, error: string) =>
  Response.json({ error }, { status, headers: corsHeaders(origin) })

// Best-effort per-instance rate limiting. A distributed rate limiter can be
// added later without changing the auth or payload contract.
function rateLimited(uid: string): boolean {
  const now = Date.now()
  const timestamps = (recentCalls.get(uid) || []).filter((time) => now - time < 60000)
  if (timestamps.length >= 8) return true
  recentCalls.set(uid, [...timestamps, now])
  if (recentCalls.size > 500) recentCalls.clear()
  return false
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || ''
  if (!isAllowedLtcAdviceOrigin(origin)) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') || ''
  if (!isAllowedLtcAdviceOrigin(origin)) return new Response(null, { status: 403 })

  const declaredSize = Number(req.headers.get('content-length') || 0)
  if (declaredSize > MAX_BODY_BYTES) return jsonError(origin, 413, 'La consulta supera el tamaño permitido.')

  let uid: string
  try {
    uid = await verifyLtcFirebaseToken(req.headers.get('authorization'))
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    if (code === 'AUTH_NOT_CONFIGURED' || code === 'AUTH_KEY_UNAVAILABLE') {
      return jsonError(origin, 503, 'Lita no pudo verificar la sesión. Intentá nuevamente.')
    }
    return jsonError(origin, 401, 'Tu sesión venció. Volvé a iniciar sesión.')
  }

  if (rateLimited(uid)) return jsonError(origin, 429, 'Demasiadas consultas. Esperá un minuto.')

  let prompt: string
  try {
    const raw = await req.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonError(origin, 413, 'La consulta supera el tamaño permitido.')
    }
    const body: unknown = JSON.parse(raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_PROMPT')
    prompt = parseLtcAdvicePrompt((body as { message?: unknown }).message)
  } catch {
    return jsonError(origin, 400, 'Ingresá una consulta financiera válida y breve.')
  }

  // The existing /api/chat already enforces financial scope, bounded provider
  // attempts, Spanish output checks and provider credentials on the server.
  const internal = new Request('https://lita.internal/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildLtcAdviceChatPayload(prompt)),
  })
  const response = await runExistingLitaChat(internal)
  const headers = new Headers(corsHeaders(origin))
  headers.set('Content-Type', response.headers.get('Content-Type') || 'text/plain; charset=utf-8')
  for (const key of ['Retry-After', 'X-Lita-Scope']) {
    const value = response.headers.get(key)
    if (value) headers.set(key, value)
  }
  return new Response(response.body, { status: response.status, headers })
}
