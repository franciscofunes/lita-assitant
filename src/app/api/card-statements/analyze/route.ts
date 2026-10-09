import { NextRequest, NextResponse } from 'next/server'
import { verifyLtcFirebaseToken, digestPdf } from '@/lib/statementAuth'
import { extractVisaStatement } from '@/lib/visaStatementParser'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PDF_BYTES = 4 * 1024 * 1024
const ALLOWED_ORIGINS = new Set([
  'https://lleva-tus-cuentas.netlify.app',
  ...(process.env.LTC_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
])
const isAllowedOrigin = (origin: string) => {
  if (ALLOWED_ORIGINS.has(origin)) return true
  // Only official Netlify deploy previews for this site. No wildcard domains.
  return /^https:\/\/deploy-preview-\d+--lleva-tus-cuentas\.netlify\.app$/.test(origin)
}
const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Vary': 'Origin',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
})
const errors: Record<string, [number, string]> = {
  INVALID_SESSION: [401, 'Tu sesión venció. Volvé a iniciar sesión.'],
  EXPIRED_SESSION: [401, 'Tu sesión venció. Volvé a iniciar sesión.'],
  AUTH_NOT_CONFIGURED: [503, 'No se pudo validar tu sesión: falta configurar el ID de proyecto Firebase en Lita. No necesitás un plan pago.'],
  AUTH_KEY_UNAVAILABLE: [503, 'No se pudo verificar tu sesión. Intentá nuevamente.'],
  EDGE_STORE_NOT_CONFIGURED: [503, 'La carga temporal de PDFs todavía no está configurada.'],
  UNSUPPORTED_PDF_LAYOUT: [422, 'Este diseño de resumen todavía no está soportado. No se guardó ningún dato.'],
  UNSUPPORTED_PDF_LENGTH: [422, 'El PDF debe tener entre 2 y 12 páginas.'],
  STATEMENT_RECONCILIATION_FAILED: [422, 'Los consumos no coinciden con los totales bancarios. Revisá este resumen manualmente.'],
}
const recent = new Map<string, number[]>()
const rateLimited = (uid: string) => {
  const now = Date.now()
  const list = (recent.get(uid) || []).filter((time) => now - time < 60000)
  if (list.length >= 3) return true
  recent.set(uid, [...list, now])
  if (recent.size > 500) recent.clear()
  return false
}
const reply = (body: object, status: number, origin: string) =>
  NextResponse.json(body, { status, headers: cors(origin) })

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin') || ''
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: cors(origin) })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin') || ''
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 })
  const size = Number(request.headers.get('content-length') || 0)
  if (size > MAX_PDF_BYTES + 64000) return reply({ error: 'Archivo demasiado grande (máximo 4 MB).' }, 413, origin)
  let fileUrl: string | null = null
  let binary: Uint8Array | null = null
  let output: object | null = null
  let status = 200
  // Record only the processing stage and a fixed error code: never log PDF
  // contents, account numbers, filenames, tokens, or authenticated user IDs.
  let stage = 'authentication'
  try {
    const uid = await verifyLtcFirebaseToken(request.headers.get('authorization'))
    if (rateLimited(uid)) return reply({ error: 'Demasiadas solicitudes. Esperá un minuto.' }, 429, origin)
    stage = 'upload-validation'
    const form = await request.formData()
    const file = form.get('pdf')
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_PDF_BYTES ||
        !['application/pdf', 'application/octet-stream', ''].includes(file.type)) {
      // Mobile browsers/file providers can omit MIME or use octet-stream.
      // The PDF signature is always checked below before parsing.
      return reply({ error: 'Seleccioná un PDF válido de hasta 4 MB.' }, 400, origin)
    }
    binary = new Uint8Array(await file.arrayBuffer())
    if (new TextDecoder().decode(binary.slice(0, 5)) !== '%PDF-') {
      return reply({ error: 'El archivo no contiene un PDF válido.' }, 422, origin)
    }
    const sha256 = digestPdf(binary)
    // Default to transient in-memory analysis: uploading sensitive bank PDFs
    // to a third party must never be a prerequisite for reading their data.
    // Opt in to Edge Store only after its upload and cleanup are verified.
    if (process.env.STATEMENT_PDF_EDGE_STORE_ENABLED === 'true') {
      stage = 'optional-temporary-storage'
      const { storeTemporaryStatement } = await import('@/lib/statementTemporaryStorage')
      fileUrl = await storeTemporaryStatement(binary, uid)
    }
    stage = 'pdf-extraction'
    const result = await extractVisaStatement(binary, sha256)
    output = { result }
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    const knownError = Object.prototype.hasOwnProperty.call(errors, code)
    const [httpStatus, message] = errors[code] || [500, 'No pudimos analizar este resumen de forma segura.']
    // Fixed diagnostic labels avoid leaking exception text or banking data.
    console.error('[card-statement-pdf] Analysis failed', {
      stage, code: knownError ? code : 'UNEXPECTED_FAILURE',
      errorType: error instanceof Error ? error.name : 'Unknown',
    })
    status = httpStatus
    output = { error: message }
  } finally {
    // If deletion fails, the object is still temporary and expires in 24h,
    // but the endpoint fails closed rather than reporting a successful cleanup.
    if (fileUrl) {
      try {
        const { deleteTemporaryStatement } = await import('@/lib/statementTemporaryStorage')
        await deleteTemporaryStatement(fileUrl)
      }
      catch {
        console.error('[card-statement-pdf] Temporary-file cleanup failed', { stage: 'cleanup' })
        status = 503
        output = { error: 'No se pudo confirmar la eliminación temporal del PDF. Reintentá más tarde.' }
      }
    }
    binary?.fill(0)
  }
  return reply(output || { error: 'Error inesperado.' }, status, origin)
}
