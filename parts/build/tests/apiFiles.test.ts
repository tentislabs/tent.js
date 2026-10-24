import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'
import { copyOf, errorsOf, filesOf } from './projects.ts'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

test('[24-5] the calls that `use` names are read from the file into the description beside the written ones, and typed in `tent.d.ts`', async () => {
  const folder = copyOf('apied', 'apied-read')
  const made = await buildProject(folder, { for: 'dev' })
  assert.deepEqual(errorsOf(made.findings), [])
  const stripe = made.description.services.stripe
  assert.ok(isRecord(stripe.calls))
  assert.deepEqual(Object.keys(stripe.calls).sort(), ['createRefund', 'getChargesCharge', 'postRefunds'])
  const read = stripe.calls.getChargesCharge
  assert.ok(isRecord(read))
  assert.deepEqual(read.headers, { 'Stripe-Account': 'Stripe-Account' })
  assert.ok(isRecord(stripe.from))
  assert.equal(stripe.from.file, 'services/stripe.openapi.json')
  assert.equal(typeof stripe.from.fingerprint, 'string')
  const typed = readFileSync(join(folder, 'tent.d.ts'), 'utf8').replace(/\s+/g, ' ')
  assert.ok(
    typed.includes(
      'interface Services { stripe: { getChargesCharge(input: { "charge": string; "Stripe-Account"?: string }): Promise<{ "id"?: string; "paid"?: boolean }>; postRefunds(input: { "charge": string }): Promise<{ "id": string }> } }',
    ),
    typed,
  )
})

test('[24-5] an operation that is not there is T7013, an error, and a part taken as `json` a warning, each on the line of the service', async () => {
  const folder = copyOf('apied', 'apied-missing')
  const file = join(folder, 'services', 'stripe.openapi.json')
  const text = readFileSync(file, 'utf8')
  writeFileSync(
    file,
    text.replace('"paid": { "type": "boolean" }', '"paid": { "oneOf": [{ "type": "boolean" }, { "type": "string" }] }'),
  )
  const service = join(folder, 'services', 'stripe.ts')
  writeFileSync(
    service,
    readFileSync(service, 'utf8').replace("'GetChargesCharge'", "'GetChargesCharge', 'GetNothing'"),
  )
  const made = await buildProject(folder, { for: 'dev' })
  const found = made.findings.filter((one) => one.code === 'T7013')
  assert.deepEqual(found.map((one) => [one.level, one.where?.file, one.where?.line]).sort(), [
    ['error', 'services/stripe.ts', 3],
    ['warning', 'services/stripe.ts', 3],
  ])
  assert.match(String(found.find((one) => one.level === 'error')?.message), /GetNothing/)
  assert.equal(made.bundleFolder, '')
})

test('[24-5] a call that both `calls` and `from` give is T1007', async () => {
  const folder = copyOf('apied', 'apied-twice')
  const service = join(folder, 'services', 'stripe.ts')
  writeFileSync(service, readFileSync(service, 'utf8').replace('createRefund: post(', 'postRefunds: post('))
  const made = await buildProject(folder, { for: 'dev' })
  assert.deepEqual(
    made.findings.map((one) => one.code),
    ['T1007'],
  )
  assert.match(made.findings[0].message, /postRefunds/)
})

test('[24-18] five calls read from a description of several megabytes that is broken in parts those calls do not need: the build works, and the bundle holds nothing of the file but the five calls', async () => {
  const folder = copyOf('apied', 'apied-large')
  const paths: Record<string, unknown> = {}
  const ok = { content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } } }
  for (let n = 0; n < 5; n++) paths[`/used/${n}`] = { get: { operationId: `Used${n}`, responses: { '200': ok } } }
  // Thousands of operations that no used call needs, many of them broken, each with a marker that is looked for in the bundle.
  for (let n = 0; n < 6000; n++)
    paths[`/other/${n}`] = {
      get: {
        operationId: `Other${n}`,
        description: `UNUSED-MARKER-${n} ${'x'.repeat(400)}`,
        parameters: n % 2 ? 'broken' : [{ $ref: '#/nowhere' }],
        responses: n % 3 ? 7 : { '200': { $ref: '#/components/responses/Missing' } },
      },
    }
  const big = JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'Big', version: '1' },
    paths,
    components: { schemas: { Broken: { $ref: '#/x' } } },
  })
  assert.ok(big.length > 2_000_000, `the file holds ${big.length} characters`)
  writeFileSync(join(folder, 'services', 'stripe.openapi.json'), big)
  const service = join(folder, 'services', 'stripe.ts')
  writeFileSync(
    service,
    readFileSync(service, 'utf8').replace(
      "use: ['PostRefunds', 'GetChargesCharge']",
      "use: ['Used0', 'Used1', 'Used2', 'Used3', 'Used4']",
    ),
  )
  const made = await buildProject(folder, { for: 'dev' })
  assert.deepEqual(errorsOf(made.findings), [])
  const calls = made.description.services.stripe.calls
  assert.ok(isRecord(calls))
  assert.deepEqual(Object.keys(calls).sort(), ['createRefund', 'used0', 'used1', 'used2', 'used3', 'used4'])
  const files = filesOf(made.bundleFolder)
  for (const [path, hex] of Object.entries(files)) {
    const bytes = Buffer.from(hex, 'hex').toString('utf8')
    assert.ok(!bytes.includes('UNUSED-MARKER'), `${path} holds a part of the file`)
    assert.ok(!path.includes('openapi'), `${path} is the file`)
  }
  const description = Buffer.from(files['description.json'], 'hex')
  assert.ok(description.length < 20_000, `the description holds ${description.length} bytes`)
})
