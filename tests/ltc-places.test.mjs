import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePlaceQuery, normalizeGeoapifySuggestions } from '../src/lib/ltcPlaces.ts'

test('bounds autocomplete queries without exposing any untrusted query to the upstream client', () => {
  assert.equal(parsePlaceQuery('  Café    Bar  '), 'Café Bar')
  for (const bad of [null, undefined, {}, '', ' a ', 'x'.repeat(81), 'a\nsearch']) {
    assert.throws(() => parsePlaceQuery(bad), /INVALID_PLACE_QUERY/)
  }
})

test('maps only five sanitized, rounded coordinate suggestions and removes duplicates', () => {
  const values = Array.from({ length: 8 }, (_, i) => ({
    name: 'Café ' + i, formatted: 'Calle ' + i + ', Buenos Aires',
    lat: -34.651234 + i / 1000, lon: -58.412345 + i / 1000,
  }))
  values.splice(1, 0, { ...values[0] })
  values.push({name:'Bad',lat:NaN,lon:20})
  const result = normalizeGeoapifySuggestions({ results: values })
  assert.equal(result.length, 5)
  assert.equal(result[0].label, 'Café 0')
  assert.equal(result[0].latitude, -34.651)
  assert.equal(result[0].longitude, -58.412)
  assert.equal(result[1].label, 'Café 1')
  assert.equal(result[0].id, '1')
  assert.ok(!result.some(p=>p.label==='Bad'))
})

test('missing, malformed and unsafe upstream payloads cannot create bogus map pins', () => {
  assert.deepEqual(normalizeGeoapifySuggestions({error:'wrong'}), [])
  assert.deepEqual(normalizeGeoapifySuggestions({results:[{name:'Unsafe',lat:91,lon:0}]}), [])
  assert.equal(normalizeGeoapifySuggestions({results:[{name:'<b>Café</b>',lat:-34.6,lon:-58.4} ]})[0].label, 'b Café /b')
})
