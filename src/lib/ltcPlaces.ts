export const MIN_PLACE_QUERY = 3
export const MAX_PLACE_QUERY = 80

export function parsePlaceQuery(value: unknown): string {
  if (typeof value !== 'string') throw new Error('INVALID_PLACE_QUERY')
  if (/[\r\n\x00-\x1f<>]/.test(value)) throw new Error('INVALID_PLACE_QUERY')
  const query = value.replace(/\s+/g, ' ').trim()
  if (query.length < MIN_PLACE_QUERY || query.length > MAX_PLACE_QUERY) throw new Error('INVALID_PLACE_QUERY')
  return query
}

export type PlaceSuggestion = {
  id: string
  label: string
  detail: string
  latitude: number
  longitude: number
}

export function normalizeGeoapifySuggestions(payload: unknown): PlaceSuggestion[] {
  if (!payload || typeof payload !== 'object' || !('results' in payload)) return []
  const list = (payload as { results?: unknown }).results
  if (!Array.isArray(list)) return []
  const unique = new Set<string>()
  const output: PlaceSuggestion[] = []
  for (const value of list.slice(0, 15)) {
    if (!value || typeof value !== 'object') continue
    const p = value as Record<string, unknown>
    const lat = p.lat, lon = p.lon
    if (typeof lat !== 'number' || typeof lon !== 'number' ||
        !Number.isFinite(lat) || !Number.isFinite(lon) ||
        Math.abs(lat) > 90 || Math.abs(lon) > 180) continue
    const clean = (v: unknown, max: number) =>
      typeof v === 'string' ? v.replace(/[\r\n<>\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''
    const label = clean(p.name || p.address_line1 || p.formatted, 100)
    if (!label) continue
    const detail = clean(p.formatted || p.address_line2, 180)
    const latitude = Number(lat.toFixed(3)), longitude = Number(lon.toFixed(3))
    const key = label.toLowerCase() + ':' + latitude + ':' + longitude
    if (unique.has(key)) continue
    unique.add(key)
    output.push({ id: String(output.length + 1), label, detail, latitude, longitude })
    if (output.length === 5) break
  }
  return output
}
