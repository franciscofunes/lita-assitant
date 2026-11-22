import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const artwork = readFileSync(new URL('../src/lib/localReportArtwork.ts', import.meta.url), 'utf8')
const dialog = readFileSync(new URL('../src/components/VisualForecastReport.tsx', import.meta.url), 'utf8')
const chat = readFileSync(new URL('../src/components/Chat.tsx', import.meta.url), 'utf8')

test('fallback illustration is local Canvas only, no finance data or external AI provider', () => {
  assert.match(artwork, /document\.createElement\('canvas'\)/)
  assert.match(artwork, /createLinearGradient/)
  assert.match(artwork, /createRadialGradient/)
  assert.match(artwork, /toBlob/)
  assert.doesNotMatch(artwork, /(?:fetch\(|navigator\.gpu|API_KEY|financialContext|spendingForecast)/)
})

test('mobile fallback is visibly not generative AI and is independent of WebGPU', () => {
  assert.match(dialog, /Aplicar diseño ligero \(sin IA\)/)
  assert.match(dialog, /Canvas sin IA/)
  assert.match(dialog, /createLocalReportArtwork\(\)/)
  assert.match(dialog, /artworkSource === 'canvas'/)
  assert.match(dialog, /setIllustration\(image\)/)
  assert.match(dialog, /El PNG descargable se actualiza/)
})

test('model progress identifies loading phase instead of generic 0% message', () => {
  assert.match(chat, /pending\.progress\([\s\S]*stage\)/)
  assert.match(dialog, /Descargando \/ cargando modelo/)
  assert.match(dialog, /Generando en GPU/)
  assert.match(dialog, /setImageStage\(stage\)/)
  assert.match(dialog, /stages\[imageStage\]/)
})
