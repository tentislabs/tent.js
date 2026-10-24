import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { agent, choice, fail, backfill, model, number, project, query, table, text } from '../index.ts'
import {
  apiDocsOf,
  definitionSource,
  describe,
  notInRecord,
  openApiOf,
  readApiFile,
  sizeOfPicture,
  toolLine,
} from '../internal.ts'

const shop = project('shop', {})
const orders = table('orders', { columns: { status: text() }, access: { read: 'signedIn' } })

/** Describes definitions that are held in memory, and answers the description. */
const described = (definitions: object[]) =>
  describe({ definitions: definitions.map((value) => ({ value })) }).description

test("[27-17] the line of a tool writes its type as typeText writes it, whatever the values of a choice hold: `US$'` stays as it is", () => {
  const price = query('price', { access: 'signedIn', output: choice(['US$', 'EUR']), run: () => 'EUR' })
  const description = described([shop, price])
  assert.equal(toolLine(description, undefined, 'price'), "Gives 'US$' | 'EUR'.")
})

test('[24-20] a field with a default may be left out of a call at /api/, so the description of the API and its docs page do not require it', () => {
  const page = query('page', {
    access: 'signedIn',
    offer: ['api'],
    input: { limit: number({ default: 50 }) },
    rows: orders.limit(20),
  })
  const description = described([shop, orders, page])
  const api = JSON.parse(JSON.stringify(openApiOf(description)))
  const [parameter] = api.paths['/page'].get.parameters
  assert.equal(parameter.required, false)
  assert.doesNotMatch(apiDocsOf(description), /<td><code>limit<\/code><\/td><td>number<\/td><td>needed<\/td>/)
})

test('[24-5] a field of a body is an input field under the name the file writes, `__proto__` among them', () => {
  const file = JSON.parse(
    '{"openapi":"3.1.0","paths":{"/x":{"post":{"operationId":"PostX","requestBody":{"content":{"application/json":{"schema":{"type":"object","properties":{"__proto__":{"type":"string"},"b":{"type":"number"}}}}}}}}}}',
  )
  const { calls } = readApiFile(file, ['PostX'])
  const input = Object(Reflect.get(Object(calls.postX), 'input'))
  assert.deepEqual(Object.keys(input).sort(), ['__proto__', 'b'])
})

test('[24-18] a description of a few kilobytes whose shapes name each other many times over, with no cycle, is read without running out of memory', () => {
  // Seven levels, each naming the next one ten times: the file is small, and its shapes followed out are ten million.
  const program = `
    import { readApiFile } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, '..', 'internal.ts')).href)}
    const schemas = {}
    for (let i = 0; i < 7; i++) {
      const properties = {}
      for (let j = 0; j < 10; j++) properties['f' + j] = i < 6 ? { $ref: '#/components/schemas/s' + (i + 1) } : { type: 'string' }
      schemas['s' + i] = { type: 'object', properties }
    }
    const body = { content: { 'application/json': { schema: { $ref: '#/components/schemas/s0' } } } }
    const file = { openapi: '3.1.0', paths: { '/x': { post: { operationId: 'PostX', requestBody: body } } }, components: { schemas } }
    readApiFile(file, ['PostX'])
    process.stdout.write('read')
  `
  const ran = spawnSync(process.execPath, ['--max-old-space-size=96', '--input-type=module', '-e', program], {
    encoding: 'utf8',
    timeout: 60_000,
  })
  assert.equal(ran.stdout, 'read', `${ran.status} ${ran.signal} ${ran.stderr.slice(0, 300)}`)
})

test('[34-2] code has no text of this kind: an agent whose key is an arrow, and a backfill, are T0013', () => {
  const writer = model('writer', { provider: 'anthropic', name: 'claude' })
  const helper = agent('helper', {
    model: writer,
    instructions: 'Help.',
    tools: [],
    limits: { steps: 4, perRun: { tokensOut: 9 } },
    key: ({ input }) => input.message,
  })
  const split = backfill('split', { table: orders, run: () => undefined })
  const description = described([shop, writer, orders, helper, split])
  for (const name of ['helper', 'split']) {
    let code: unknown
    try {
      definitionSource(description, name)
    } catch (error) {
      code = Reflect.get(Object(error), 'code')
    }
    assert.equal(code, 'T0013', name)
  }
})

test('[34-2] a tool refuses to write a definition anew that reads a name of its file, also in a file that holds a regular expression', () => {
  const text = "export const orders = table('orders', { columns: { note: text({ max: NOTE }) } })"
  const file = `import { table, text } from 'tentjs'\nconst quote = /'/\nconst NOTE = 500\n${text}\n`
  assert.match(String(notInRecord(text, file, new Set(['orders']), 'orders')), /NOTE/)
})

test("[16-2] an app's own fail uses a code of the builder's own, never one of the form of a framework code", () => {
  let thrown: unknown
  try {
    fail('T0006', 'You need to sign in.')
  } catch (error) {
    thrown = error
  }
  assert.notEqual(Reflect.get(Object(thrown), 'code'), 'T0006')
})

test('[22-4] the size of an AVIF picture is read from its bytes whatever their length: a box of its size after a megabyte of others', () => {
  // The build hands every asset whole, and the image door a picture as it is stored.
  const bytes = new Uint8Array(1_200_000)
  bytes.set(new TextEncoder().encode('ispe'), 1_100_000)
  new DataView(bytes.buffer).setUint32(1_100_008, 640)
  new DataView(bytes.buffer).setUint32(1_100_012, 480)
  assert.deepEqual(sizeOfPicture('image/avif', bytes), { width: 640, height: 480 })
})
