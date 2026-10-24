import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { readApiFile } from '../../core/internal.ts'
import { buildProject } from '../index.ts'
import { copyOf } from './projects.ts'

const json = (schema: object) => ({ content: { 'application/json': { schema } } })

/** Points the `from` of the service of the project at another place. */
function fromAt(folder: string, from: string): void {
  const file = join(folder, 'services', 'stripe.ts')
  writeFileSync(file, readFileSync(file, 'utf8').replace("'./stripe.openapi.json'", JSON.stringify(from)))
}

test('[05-11.22] a `from` file that is a link to a file outside the project is T1014', async (t) => {
  const folder = copyOf('apied', 'attacks-from-link')
  const outside = join(folder, '..', 'outside')
  mkdirSync(outside, { recursive: true })
  t.after(() => rmSync(outside, { recursive: true, force: true }))
  writeFileSync(join(outside, 'stripe.openapi.json'), readFileSync(join(folder, 'services', 'stripe.openapi.json')))
  // A junction needs no right of its own on Windows, where a link to a file does.
  symlinkSync(outside, join(folder, 'services', 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  fromAt(folder, './linked/stripe.openapi.json')
  const linked = await buildProject(folder, { for: 'dev' })
  assert.ok(
    linked.findings.some((one) => one.code === 'T1014' && one.level === 'error'),
    JSON.stringify(linked.findings),
  )
  fromAt(folder, '../../outside/stripe.openapi.json')
  const climbed = await buildProject(folder, { for: 'dev' })
  assert.ok(climbed.findings.some((one) => one.code === 'T1014' && one.level === 'error'))
})

test('[05-11.31] a `from` file with a reference to another file or to an address, and one whose shapes hold each other a thousand deep, is not followed, and taken as `json`', () => {
  const schemas: Record<string, object> = {}
  for (let n = 0; n < 1000; n++)
    schemas[`S${n}`] = { type: 'object', properties: { next: { $ref: `#/components/schemas/S${(n + 1) % 1000}` } } }
  const file = {
    openapi: '3.1.0',
    info: { title: 'Shop', version: '1' },
    paths: {
      '/other': { get: { operationId: 'GetOther', responses: { '200': json({ $ref: 'other.json#/Thing' }) } } },
      '/away': {
        get: { operationId: 'GetAway', responses: { '200': json({ $ref: 'https://evil.example/schema.json' }) } },
      },
      '/deep': { get: { operationId: 'GetDeep', responses: { '200': json({ $ref: '#/components/schemas/S0' }) } } },
    },
    components: { schemas },
  }
  const began = performance.now()
  const { calls, findings } = readApiFile(file, ['GetOther', 'GetAway', 'GetDeep'])
  assert.ok(performance.now() - began < 2000)
  const outputOf = (name: string): unknown => Reflect.get(Object(calls[name]), 'output')
  assert.deepEqual(outputOf('getOther'), { kind: 'json' })
  assert.deepEqual(outputOf('getAway'), { kind: 'json' })
  // A shape that holds itself becomes `json` where it comes round again, at whatever depth.
  assert.ok(JSON.stringify(outputOf('getDeep')).length < 200_000)
  assert.match(JSON.stringify(outputOf('getDeep')), /"kind":"json"/)
  assert.ok(findings.some((one) => one.code === 'T7013' && one.level === 'warning' && /other\.json/.test(one.message)))
  assert.ok(
    findings.some((one) => one.code === 'T7013' && one.level === 'warning' && /evil\.example/.test(one.message)),
  )
})
