// Bounded and origin-checked requests from LTC's older standalone advice widget.
// Keep this separate from the embedded Lita chat contract.
export const LTC_ADVICE_MAX_CHARS = 1500

const defaultOrigins = new Set([
  'https://lleva-tus-cuentas.netlify.app',
  'https://llevatuscuentas.vercel.app',
  'http://localhost:3000',
])

export function isAllowedLtcAdviceOrigin(origin: string, extraOrigins = process.env.LTC_ALLOWED_ORIGINS || ''): boolean {
  if (!origin) return false
  if (defaultOrigins.has(origin)) return true
  // Match only the site's explicit Netlify deploy-preview hostname.
  if (/^https:\/\/deploy-preview-\d+--lleva-tus-cuentas\.netlify\.app$/.test(origin)) return true
  return extraOrigins.split(',').some((entry) => entry.trim() === origin && entry.trim().length > 0)
}

export function parseLtcAdvicePrompt(value: unknown): string {
  if (typeof value !== 'string') throw new Error('INVALID_PROMPT')
  const prompt = value.trim()
  if (!prompt || prompt.length > LTC_ADVICE_MAX_CHARS) throw new Error('INVALID_PROMPT')
  return prompt
}

export function buildLtcAdviceChatPayload(prompt: string) {
  // The legacy widget has no financial records. Do not invent user data,
  // forward arbitrary system roles or accept a caller-specified context.
  return {
    messages: [{ role: 'user' as const, content: prompt }],
    context: { section: 'transactions' },
  }
}
