import { createHash, createPublicKey, verify } from 'node:crypto'

type JwtClaims = {
  iss: string
  aud: string
  sub: string
  exp: number
  iat: number
  auth_time: number
  user_id?: string
}
type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string }
let jwksCache: { expires: number; keys: Jwk[] } | undefined

const decode = (value: string) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))

/**
 * Verify the Firebase ID token cryptographically on LITA, not by merely
 * decoding an untrusted JWT or accepting a userId from LTC.
 * Google's SecureToken signing keys rotate and are cached briefly.
 */
export async function verifyLtcFirebaseToken(authorization: string | null): Promise<string> {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  if (!projectId || !/^[a-z0-9-]{5,100}$/.test(projectId)) throw new Error('AUTH_NOT_CONFIGURED')
  const found = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization || '')
  if (!found || found[1].length > 10000) throw new Error('INVALID_SESSION')
  const parts = found[1].split('.')
  if (parts.length !== 3) throw new Error('INVALID_SESSION')
  const header = decode(parts[0])
  const payload = decode(parts[1]) as JwtClaims
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
      typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 128 ||
      payload.aud !== projectId || payload.iss !== 'https://securetoken.google.com/' + projectId) {
    throw new Error('INVALID_SESSION')
  }
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(payload.exp) || payload.exp <= now ||
      !Number.isFinite(payload.iat) || payload.iat > now + 60 ||
      !Number.isFinite(payload.auth_time) || payload.auth_time > now + 60) {
    throw new Error('EXPIRED_SESSION')
  }
  if (!jwksCache || jwksCache.expires < Date.now()) {
    const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error('AUTH_KEY_UNAVAILABLE')
    const jwks = await response.json() as { keys: Jwk[] }
    if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) throw new Error('AUTH_KEY_UNAVAILABLE')
    jwksCache = { keys: jwks.keys, expires: Date.now() + 45 * 60 * 1000 }
  }
  const key = jwksCache.keys.find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA')
  if (!key) {
    jwksCache = undefined
    throw new Error('AUTH_KEY_UNAVAILABLE')
  }
  const signer = createPublicKey({ key: key as any, format: 'jwk' })
  const signatureOK = verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]),
    signer, Buffer.from(parts[2], 'base64url'))
  if (!signatureOK) throw new Error('INVALID_SESSION')
  return payload.sub
}

export const digestPdf = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
