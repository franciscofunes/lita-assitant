import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const chat = readFileSync(new URL('../src/components/Chat.tsx', import.meta.url), 'utf8')
const dialog = readFileSync(new URL('../src/components/VisualForecastReport.tsx', import.meta.url), 'utf8')

test('the host WebGPU capability handshake runs before the user can generate', () => {
  assert.match(chat, /lita:illustration:capability:request/)
  assert.match(chat, /lita:illustration:capability:result/)
  assert.match(dialog, /useEffect\(\(\) => \{\s*let active = true\s*void checkRef\.current\(\)/)
  assert.match(dialog, /disabled=\{illustrating \|\| capability !== 'supported'\}/)
  assert.match(dialog, /Verificando WebGPU y memoria del dispositivo/)
  assert.match(dialog, /No disponible en este dispositivo:/)
})

test('iframe relays error reason rather than discarding it as null', () => {
  assert.match(chat, /pending\.reject\(new Error\(typeof reply\.reason/)
  assert.match(chat, /new Error\('La generación superó el tiempo de espera/)
  assert.match(dialog, /catch \(error\)/)
  assert.match(dialog, /setIllustrationError\(cause/)
  assert.doesNotMatch(dialog, /catch \{\s*setIllustrationError\('No se pudo generar la ilustración local/)
})

test('postMessage carries only request ID, no personal finances or prompts', () => {
  assert.match(chat, /window\.parent\.postMessage\(\{ type: 'lita:illustration:request', payload: \{ requestId \} \}, origin\)/)
  assert.match(chat, /window\.parent\.postMessage\(\{ type: 'lita:illustration:capability:request', payload: \{ requestId \} \}, origin\)/)
  assert.match(chat, /window\.parent !== window/)
  assert.match(chat, /currentHostContextRef\.current\?\.privacyHidden === true/)
})

test('UI directs users to official runonweb device demo and preserves deterministic PNG', () => {
  assert.match(dialog, /https:\/\/runonweb\.ai\/models\/image/)
  assert.match(dialog, /Descargar PNG/)
  assert.match(dialog, /El reporte PNG normal sigue disponible/)
})
