import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'
import { copyOf, lineWith } from './copies.ts'

// A second failing project for each of these screen rules: the passing project of T6011, with one more screen
// file that makes the mistake in another way than the first failing project does.
const head = [
  "import { screen, read, text, Link } from 'tentjs/ui'",
  "import { openOrders } from '../functions/orders'",
  '',
  '',
].join('\n')

/** A screen open to anyone, with what the case adds to its options and its view. */
const screenOf = (name: string, more: string, view: string): string =>
  `export const ${name} = screen('${name}', {\n  path: '/${name}',\n  access: 'anyone',\n${more}  view: ${view},\n})\n`

// Each rule: the file of the screen, and the piece of the line that the finding stands on.
const mistakes: Record<string, [text: string, piece: string]> = {
  T6011: [
    screenOf('mineC', "  state: { q: text({ default: '' }) },\n", '() => <Link set={{ q: 5 }}>Five</Link>'),
    'set={{ q: 5 }}',
  ],
  T6012: [
    "export const mineD = screen('mineD', { for: 'error', access: 'signedIn', view: () => <span>Bad</span> })\n",
    "for: 'error'",
  ],
  T6013: [screenOf('mineE', '', "() => <Link to={'/\t/evil.example'}>Away</Link>"), "to={'/"],
  T6015: [
    screenOf(
      'mineF',
      "  cache: '1 minute',\n  data: { orders: read(openOrders) },\n",
      '({ orders }) => <span>{orders.length}</span>',
    ),
    'data: { orders',
  ],
  T6030: [
    screenOf(
      'mineK',
      "  cache: { for: '1 minute', public: true },\n",
      "({ user }) => <span>{user ? user.id : 'none'}</span>",
    ),
    'user ? user.id',
  ],
}

test('[30-2] a failing project of the reviewer for each screen rule held here gives exactly that code, on the line of its mistake', async () => {
  for (const [code, [screen, piece]] of Object.entries(mistakes)) {
    const folder = copyOf(join('T6011', 'pass'), `reviewed-${code}`)
    const file = join(folder, 'screens', 'mine.tsx')
    writeFileSync(file, head + screen)
    const found = (await checkRules(folder)).findings
    const said = found.map((one) => `${one.code} ${one.where?.file}:${one.where?.line} ${one.message}`).join('\n')
    assert.deepEqual(
      found.map((one) => one.code),
      [code],
      `${code}:\n${said}`,
    )
    assert.equal(found[0].where?.file, 'screens/mine.tsx', said)
    // A finding about a whole screen stands on the line of its definition, as the builder reads it.
    const line = lineWith(readFileSync(file, 'utf8'), piece)
    assert.ok([line, lineWith(readFileSync(file, 'utf8'), 'export const')].includes(found[0].where?.line ?? 0), said)
  }
})
