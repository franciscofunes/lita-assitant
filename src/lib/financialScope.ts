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

export const assessFinancialScope = (text: unknown): 'allowed' | 'greeting' | 'denied' => {
  if (typeof text !== 'string' || text.length > 1500) return 'denied'
  const cleaned = text.trim()
  if (!cleaned) return 'denied'
  if (greetings.test(cleaned)) return 'greeting'
  if (outOfScope.some((pattern) => pattern.test(cleaned))) return 'denied'
  if (!financeSubjects.some((pattern) => pattern.test(cleaned))) return 'denied'
  return 'allowed'
}
