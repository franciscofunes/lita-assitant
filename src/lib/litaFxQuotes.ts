/**
 * Bounded, read-only FX quote snapshot supplied by LTC's authenticated iframe.
 *
 * Quotes are indicative market prices, never booked trades or historical rates.
 * Buy (compra): pesos received for selling USD. Sell (venta): pesos required
 * when buying USD. The two are intentionally not interchangeable.
 */
export const FX_MARKETS = [
  { key: 'bolsa', label: 'MEP' },
  { key: 'contadoconliqui', label: 'CCL' },
  { key: 'oficial', label: 'Oficial' },
  { key: 'blue', label: 'Blue' },
  { key: 'cripto', label: 'Cripto' },
] as const

export type FxMarket = typeof FX_MARKETS[number]['key']
export type FxQuote = {
  key: FxMarket
  compra: number
  venta: number
  updatedAt: string
}

const MAX_AGE_MS = 96 * 3600_000
const LIVE_FRESHNESS_MS = 36 * 3600_000
const FUTURE_CLOCK_TOLERANCE_MS = 24 * 3600_000
const keys = new Set<string>(FX_MARKETS.map((market) => market.key))

export function parseLiveFxQuotes(input: unknown, now: number = Date.now()): FxQuote[] {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return []
  const packet = input as Record<string, unknown>
  if (packet.source !== 'DolarAPI' || packet.success !== true || !Array.isArray(packet.quotes)) return []
  const seen = new Set<string>()
  return packet.quotes.slice(0, 12).flatMap((value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
    const item = value as Record<string, unknown>
    if (typeof item.key !== 'string' || !keys.has(item.key) || seen.has(item.key)) return []
    if (typeof item.compra !== 'number' || !Number.isFinite(item.compra) ||
        typeof item.venta !== 'number' || !Number.isFinite(item.venta) ||
        item.compra <= 0 || item.venta <= 0 || item.compra > 1e7 || item.venta > 1e7) return []
    if (typeof item.updatedAt !== 'string') return []
    const updated = Date.parse(item.updatedAt)
    if (!Number.isFinite(updated) || updated > now + FUTURE_CLOCK_TOLERANCE_MS ||
        now - updated > MAX_AGE_MS) return []
    seen.add(item.key)
    return [{ key: item.key as FxMarket, compra: item.compra,
      venta: item.venta, updatedAt: new Date(updated).toISOString() }]
  }).sort((a, b) => FX_MARKETS.findIndex((m) => m.key === a.key) -
    FX_MARKETS.findIndex((m) => m.key === b.key))
}

export function selectedFxQuote(quotes: readonly FxQuote[], market: FxMarket,
  now: number = Date.now()): FxQuote | null {
  const exact = quotes.find((quote) => quote.key === market)
  if (!exact) return null
  const parsed = parseLiveFxQuotes({ source: 'DolarAPI', success: true, quotes: [exact] }, now)
  return parsed[0] || null
}

/** A quote from a closed market can still be a bounded reference, not live. */
export const isFxQuoteLastClose = (quote: FxQuote, now: number = Date.now()): boolean =>
  now - Date.parse(quote.updatedAt) > LIVE_FRESHNESS_MS

export const fxMarketLabel = (market: FxMarket): string =>
  FX_MARKETS.find((item) => item.key === market)?.label || 'MEP'

export const localFxNumber = (value: number, currency: 'ARS' | 'USD'): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Math.round((value + Number.EPSILON) * 100) / 100)

export const roundFx = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100
