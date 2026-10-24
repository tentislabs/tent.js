import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'
import { copyOf, lineWith } from './copies.ts'

const file = 'screens/orders.tsx'

test('[30-4] an Image whose src, written in place, is no asset, and that states neither width nor height is T6025, a warning; an asset, and an Image that states its width or its height, are not', async () => {
  const folder = copyOf(join('T6025', 'pass'), 'image-sizes')
  writeFileSync(
    join(folder, file),
    [
      "import { screen, asset, text, Image } from 'tentjs/ui'",
      '',
      "export const ordersScreen = screen('ordersScreen', {",
      "  path: '/orders',",
      "  access: 'signedIn',",
      "  state: { photo: text({ default: '' }) },",
      '  view: ({ state }) => (',
      '    <main>',
      '      <Image src={state.photo} alt="Unsized" />',
      '      <Image src="https://pictures.example.com/a.png" alt="Unsized too" />',
      '      <Image src={asset(\'poster.png\')} alt="By its file" />',
      '      <Image src={state.photo} alt="Wide" width={240} />',
      '      <Image src={state.photo} alt="High" height={120} />',
      '    </main>',
      '  ),',
      '})',
      '',
    ].join('\n'),
  )
  const text = readFileSync(join(folder, file), 'utf8')
  const found = (await checkRules(folder)).findings.filter((one) => one.code === 'T6025')
  assert.deepEqual(
    found.map((one) => [one.where?.line, one.level]),
    [
      [lineWith(text, 'alt="Unsized"'), 'warning'],
      [lineWith(text, 'alt="Unsized too"'), 'warning'],
    ],
  )
})
