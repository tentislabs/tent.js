import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { boolean, list, object, text } from '../../core/index.ts'
import { checkValue, readApiFile } from '../../core/internal.ts'
import { copied, typed } from './typed.ts'

/** The stored shape of what `tent api read` prints with `--json`. */
const shape = object({
  ok: boolean(),
  value: object({ out: text(), version: text() }, { optional: true }),
  findings: list(object({})),
})

// A description in the version before 3.0, with a body, a parameter of the address, an answer and a shape.
const older = {
  swagger: '2.0',
  info: { title: 'Shop', version: '1' },
  paths: {
    '/v1/refunds': {
      post: {
        operationId: 'PostRefunds',
        consumes: ['application/x-www-form-urlencoded'],
        parameters: [
          { name: 'charge', in: 'formData', required: true, type: 'string' },
          { name: 'expand', in: 'query', type: 'array', items: { type: 'string' } },
        ],
        responses: { '200': { description: 'ok', schema: { $ref: '#/definitions/Refund' } } },
      },
    },
    '/v1/notes': {
      post: {
        operationId: 'PostNotes',
        parameters: [{ name: 'body', in: 'body', schema: { $ref: '#/definitions/Note' } }],
        responses: { '201': { description: 'made', schema: { $ref: '#/definitions/Refund' } } },
      },
    },
  },
  definitions: {
    Refund: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    Note: { type: 'object', properties: { text: { type: 'string' } } },
  },
}

test('[24-5] [15-6@8a] `tent api read` turns a description of the version before 3.0 into 3.1, which the build reads, and prints its stored shape with --json', async (t) => {
  const project = copied(t, 'api-read')
  writeFileSync(join(project, 'older.json'), JSON.stringify(older))
  const done = await typed(project, 'api', 'read', 'older.json', '--out', 'services/shop.openapi.json', '--json')
  assert.equal(done.ended, 0, done.printed)
  assert.deepEqual(checkValue(shape, done.answer), [], done.printed)
  assert.deepEqual(done.answer.value, { out: 'services/shop.openapi.json', version: '3.1.0' })
  const written = JSON.parse(readFileSync(join(project, 'services', 'shop.openapi.json'), 'utf8'))
  assert.equal(written.openapi, '3.1.0')
  const read = readApiFile(written, ['PostRefunds', 'PostNotes'])
  assert.deepEqual(read.findings, [])
  const refund = read.calls.postRefunds as Record<string, unknown>
  assert.equal(refund.body, 'form')
  assert.deepEqual(refund.input, {
    expand: { kind: 'list', optional: true, of: { kind: 'text' } },
    charge: { kind: 'text' },
  })
  assert.deepEqual(refund.output, { kind: 'object', shape: { id: { kind: 'text' } } })
  const note = read.calls.postNotes as Record<string, unknown>
  assert.deepEqual(note.input, { text: { kind: 'text', optional: true } })
})

test('[24-5] `tent api read` of a file that is no description is T7013, and writes nothing', async (t) => {
  const project = copied(t, 'api-read-broken')
  writeFileSync(join(project, 'other.json'), JSON.stringify({ openapi: '4.0.0', paths: {} }))
  const done = await typed(project, 'api', 'read', 'other.json', '--out', 'services/x.json', '--json')
  assert.equal(done.ended, 1, done.printed)
  assert.deepEqual(
    done.answer.findings?.map((one) => one.code),
    ['T7013'],
  )
})

test('[24-5] `tent api read` turns a file in YAML into the JSON that the build reads', {
  todo: 'the reader of YAML is a part that the tools fetch on first use, and fetched.json pins none yet',
}, async (t) => {
  const project = copied(t, 'api-read-yaml')
  writeFileSync(
    join(project, 'shop.yaml'),
    [
      'openapi: 3.1.0',
      'info: { title: Shop, version: "1" }',
      'paths:',
      '  /v1/things:',
      '    get:',
      '      operationId: GetThings',
      '      responses: {}',
      '',
    ].join('\n'),
  )
  const done = await typed(project, 'api', 'read', 'shop.yaml', '--out', 'services/shop.openapi.json', '--json')
  assert.equal(done.ended, 0, done.printed)
  const written = JSON.parse(readFileSync(join(project, 'services', 'shop.openapi.json'), 'utf8'))
  assert.deepEqual(Object.keys(readApiFile(written, ['GetThings']).calls), ['getThings'])
})
