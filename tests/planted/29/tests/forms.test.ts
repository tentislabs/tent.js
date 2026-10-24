import { mkdirSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'

test('[99-3] a test whose rigs write a measure and a picture of another form', () => {
  mkdirSync('results/parts', { recursive: true })
  writeFileSync('results/parts/measure.no.number.json', JSON.stringify({ value: 'three', unit: 'ms' }))
  writeFileSync('results/parts/measure.no.unit.json', JSON.stringify({ value: 3 }))
  writeFileSync('results/parts/measure.cut.short.json', '{ "value": 3,')
  writeFileSync('results/parts/measure.one.more.json', JSON.stringify({ value: 3, unit: 'ms', more: true }))
  writeFileSync('results/parts/picture.chromium.old.json', JSON.stringify('old'))
})
