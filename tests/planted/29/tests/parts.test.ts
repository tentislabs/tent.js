import { mkdirSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'

test('[99-2] a test whose rigs write a measure and a picture', () => {
  mkdirSync('results/parts', { recursive: true })
  writeFileSync('results/parts/measure.start.first.json', JSON.stringify({ value: 3, unit: 'ms', bar: 5 }))
  writeFileSync('results/parts/picture.chromium.front.page.json', JSON.stringify('new'))
})
