/**
 * Deny-by-default LITA domain policy. Executed SERVER-SIDE before any
 * provider call. Client validation / model instructions alone cannot
 * enforce product scope. Unclear queries are rejected.
 */
export const LITA_SCOPE_REFUSAL =
  'LITA está limitada a tus finanzas en Lleva Tus Cuentas: movimientos, gastos, ingresos, divisas, inversiones y Portfolio. Reformulá tu consulta sobre esos datos.'

const outOfScope = [
  /\b(?:javascript|typescript|python|java|html|css|sql|react|angular|next\.?js|node\.?js|github|api|programaci[oó]n|c[oó]digo|algoritmos?|primos?|fibonacci|debug|regex|software|desarrollo\s+web)\b/i,
  /\b(?:ecuaci[oó]n|matem[aá]tica|derivadas?|integrales?|receta|cocina|f[uú]tbol|deportes?|pel[ií]cula|canci[oó]n|poema|cuento|hor[oó]scopo|chiste|tradu(?:ce|cir)|traduc[ií]|pol[ií]tica|elecciones|historia\s+universal|geograf[ií]a|qu[ií]mica)\b/i,
  /\b(?:ignora|ignor[aá]|olvida|desobedece|sos\s+ahora|act[uú]a\s+como|pretend|ignore\s+(?:all|previous)|system\s*prompt|developer\s*message|jailbreak|DAN\b|prompt\s+injection|instrucciones?\s+anteriores)\b/i,
  /(?:\x60{3}|<\s*script|<\/?\s*(?:system|developer|assistant)\b)/i,
]
const financeSubjects = [
  /\b(?:ltc|lita|portfolio|portafolio|patrimonio|finanz\w*|presupuest\w*|dinero|balance|movimient\w*|transacci\w*|cuentas?\s+(?:remunerad\w*|bancari\w*)|banc\w*|tarjeta\w*|res[uú]men\w*|pago\w*|gast\w*|ingres\w*|egres\w*|ahorr\w*|invert\w*|inversi\w*|divis\w*|d[oó]lar\w*|pesos?|usd|ars|cambio|cotizaci[oó]n\w*|mercado\s*pago|prex|astropay|balanz|deel|fci|plazo\s*fijo|rendimient\w*|tna|tea|inter[eé]s\w*|rentabilidad|gananci\w*|saldo\w*|retiro\w*|extracci[oó]n\w*|aporte\w*|transferenci\w*|capital|vencimient\w*|cobr\w*|inflaci[oó]n\w*|comisi[oó]n\w*|impuest\w*)\b/i,
]
const greetings = /^(?:hola|buenas|buen\s+d[ií]a|buenas\s+tardes|buenas\s+noches)[!¡.\s]*$/i

// LTC exports can contain many positions or transactions. Only recognized
// financial report formats may exceed the short-chat threshold.
export const MAX_LTC_FINANCIAL_PROMPT_CHARS = 32000
const MAX_SHORT_FINANCIAL_QUESTION_CHARS = 1500

const ltcFinancialExports = [
  {
    header: /^# Portfolio LTC [—-] contexto para an[aá]lisis LLM\s*$/im,
    markers: [/^## Totales por moneda\s*$/im, /^## Posiciones\s*$/im, /^## Pedido de investigaci[oó]n y an[aá]lisis\s*$/im],
    request: /^## Pedido de investigaci[oó]n y an[aá]lisis\s*$/im,
  },
  {
    header: /^# LTC [—-] Transacciones [·-] contexto para Lita\s*$/im,
    markers: [/^## Reglas del an[aá]lisis\s*$/im, /^## Movimientos\s*$/im, /^## Pedido para Lita\s*$/im],
    request: /^## Pedido para Lita\s*$/im,
  },
]

const recognizedFinancialExportRequest = (text: string): string | null => {
  // A complete LTC export with a matching first line and required sections.
  for (const format of ltcFinancialExports) {
    const firstLine = text.split(/\r?\n/, 1)[0]
    if (!format.header.test(firstLine) || !format.markers.every((marker) => marker.test(text))) continue
    const index = text.search(format.request)
    if (index < 0) continue
    return text.slice(index)
  }
  return null
}

export const assessFinancialScope = (text: unknown): 'allowed' | 'greeting' | 'denied' => {
  if (typeof text !== 'string' || text.length > MAX_LTC_FINANCIAL_PROMPT_CHARS) return 'denied'
  const cleaned = text.trim()
  if (!cleaned) return 'denied'
  if (greetings.test(cleaned)) return 'greeting'

  if (cleaned.length <= MAX_SHORT_FINANCIAL_QUESTION_CHARS) {
    if (outOfScope.some((pattern) => pattern.test(cleaned))) return 'denied'
    return financeSubjects.some((pattern) => pattern.test(cleaned)) ? 'allowed' : 'denied'
  }

  const request = recognizedFinancialExportRequest(cleaned)
  if (!request) return 'denied'

  // Dangerous role/prompt override phrases and markup remain forbidden anywhere.
  // Other off-topic keywords in asset names or financial URLs are reference data,
  // so evaluate those only in the report's actual instruction/request section.
  if (outOfScope.slice(2).some((pattern) => pattern.test(cleaned))) return 'denied'
  if (outOfScope.slice(0, 2).some((pattern) => pattern.test(request))) return 'denied'
  return financeSubjects.some((pattern) => pattern.test(request)) ? 'allowed' : 'denied'
}
