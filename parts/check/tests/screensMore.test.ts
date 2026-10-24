import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkProject } from '../index.ts'
import { copyOf, heldToProjects, lineWith } from './copies.ts'

const file = 'screens/orders.tsx'

// Each screen rule that is held here, with every mistake of its failing project: a piece of the line it stands
// on, and what the sentence of its finding says.
const rules: Record<string, [piece: string, says: RegExp][]> = {
  T6011: [
    ['set={{ nope: true }}', /`nope`.*not declared/],
    ["set={{ page: 'two' }}", /`page`/],
    ['set: { missing: true }', /`missing`/],
    ["reset: ['gone']", /`gone`/],
    ["mode: text({ default: '' })", /`mode`.*project/],
  ],
  T6012: [
    ['view: () => <Loop />', /`Loop`.*itself/],
    ["layout: 'Nowhere'", /`Nowhere`/],
    ["loading: 'Nothing'", /`Nothing`/],
    ['seo: { addresses: read(openOrders) }', /openOrders/],
    ['export const lostScreen', /`anyone`/],
    ['export const againLostScreen', /second/],
  ],
  T6013: [
    ['to="//evil.example/"', /evil\.example/],
    ['to="/%2F%2Fevil.example"', /percent/],
    ['to="/orders\\\\evil"', /backslash/],
    ["href: 'javascript:alert(1)'", /`javascript`/],
    ["href: 'ftp://example.com/file'", /`ftp`/],
    ["go('/a//evil.example')", /`\/\/`/],
  ],
  T6015: [
    ['cache: 60_000,', /not open to anyone/],
    ['data: { orders: read(openOrders) }', /`orders`.*openOrders/],
  ],
  T6030: [
    ["user ? user.id : ''", /`user`/],
    ["user ? user.id : ''", /device/],
  ],
}

const warnings = ['T6030']

test('[30-7] every screen rule held here has a passing project and a failing project, and the failing one gives exactly its code, once for each mistake, on its line', async () => {
  for (const [code, cases] of Object.entries(rules)) {
    const { findings: failing, folder } = await heldToProjects(code)
    const text = readFileSync(join(folder, file), 'utf8')
    const found = failing.map((one) => `${one.code} ${one.where?.line}: ${one.message}`).join('\n')
    const lines = cases.map(([piece]) => lineWith(text, piece))
    assert.ok(!lines.includes(0), `every piece of ${code} is a line of its file`)
    assert.deepEqual(failing.map((one) => one.where?.line).sort(), [...lines].sort(), `${code}:\n${found}`)
    for (const [k, [piece, says]] of cases.entries())
      assert.ok(
        failing.some((one) => one.where?.line === lines[k] && says.test(one.message)),
        `${code}, at ${piece}, says ${says}:\n${found}`,
      )
    for (const one of failing) {
      assert.equal(one.where?.file, file, code)
      assert.ok(one.message.length > 10 && one.fix, code)
      assert.equal(one.docs, `tent docs ${code}`)
      assert.equal(one.level, warnings.includes(code) ? 'warning' : 'error', code)
    }
  }
})

test('[30-7] the passing project of every screen rule held here passes the type checker too', async () => {
  for (const code of Object.keys(rules)) {
    const made = await checkProject(copyOf(join(code, 'pass'), `${code}-pass-typed`))
    assert.deepEqual(
      made.findings.map((one) => `${one.code} ${one.where?.file}:${one.where?.line} ${one.message}`),
      [],
      `the passing project of ${code}`,
    )
  }
})
