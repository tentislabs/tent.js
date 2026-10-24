import assert from 'node:assert/strict'
import test from 'node:test'
import { readApiFile } from '../internal.ts'

/** A description of an API in version 3.1, with the operations and the shapes a test gives it. */
const fileOf = (paths: object, schemas: object = {}, version = '3.1.0') => ({
  openapi: version,
  info: { title: 'Shop', version: '1' },
  paths,
  components: { schemas },
})

const json = (schema: object) => ({ content: { 'application/json': { schema } } })

test('[24-5] each row of the types is read into its type, a reference is followed inside the file, and a field is required where the file says so', () => {
  const file = fileOf(
    {
      '/v1/things': {
        post: {
          operationId: 'PostThings',
          requestBody: json({
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
              state: { type: 'string', enum: ['open', 'closed'] },
              at: { type: 'string', format: 'date-time' },
              on: { type: 'string', format: 'date' },
              price: { type: 'number' },
              count: { type: 'integer' },
              paid: { type: 'boolean' },
              tags: { type: 'array', items: { type: 'string' } },
              owner: { $ref: '#/components/schemas/Owner' },
              either: { oneOf: [{ type: 'string' }, { type: 'number' }] },
              free: { type: 'object', additionalProperties: true },
            },
          }),
          responses: { '201': json({ $ref: '#/components/schemas/Thing' }) },
        },
      },
    },
    {
      Owner: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, mail: { type: 'string' } } },
      Thing: { type: 'object', properties: { id: { type: 'string' }, child: { $ref: '#/components/schemas/Thing' } } },
    },
  )
  const { calls, findings } = readApiFile(file, ['PostThings'])
  assert.deepEqual(Object.keys(calls), ['postThings'])
  const call = calls.postThings as Record<string, unknown>
  assert.equal(call.method, 'POST')
  assert.equal(call.path, '/v1/things')
  assert.deepEqual(call.input, {
    name: { kind: 'text' },
    state: { kind: 'choice', optional: true, values: ['open', 'closed'] },
    at: { kind: 'date', optional: true },
    on: { kind: 'day', optional: true },
    price: { kind: 'number', optional: true },
    count: { kind: 'number', optional: true, whole: true },
    paid: { kind: 'boolean', optional: true },
    tags: { kind: 'list', optional: true, of: { kind: 'text' } },
    owner: {
      kind: 'object',
      optional: true,
      shape: { id: { kind: 'text' }, mail: { kind: 'text', optional: true } },
    },
    either: { kind: 'json', optional: true },
    free: { kind: 'json', optional: true },
  })
  // A shape that holds itself is taken as `json` where it comes round again.
  assert.deepEqual(call.output, {
    kind: 'object',
    shape: { id: { kind: 'text', optional: true }, child: { kind: 'json', optional: true } },
  })
  assert.deepEqual(
    findings.map((one) => [one.code, one.level]),
    [
      ['T7013', 'warning'],
      ['T7013', 'warning'],
      ['T7013', 'warning'],
    ],
  )
  assert.ok(findings.every((one) => /postThings/.test(one.message)))
})

test('[24-5] `use` as a record names the calls, an operation with no id is named by its method and its path, and the parameters of the path, the address and the headers are input fields', () => {
  const file = fileOf({
    '/v1/charges/{charge}': {
      parameters: [{ name: 'charge', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'GetChargesCharge',
        parameters: [
          { name: 'expand', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
          { name: 'X-Tenant', in: 'header', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': json({ type: 'object', properties: { id: { type: 'string' } } }) },
      },
    },
    '/v1/refunds': {
      post: {
        requestBody: {
          content: {
            'application/x-www-form-urlencoded': {
              schema: { type: 'object', required: ['charge'], properties: { charge: { type: 'string' } } },
            },
          },
        },
        responses: { '200': json({ type: 'object', properties: { id: { type: 'string' } } }) },
      },
    },
    '/v1/files': {
      post: {
        operationId: 'PostFiles',
        parameters: [{ name: 'purpose', in: 'query', schema: { type: 'string' } }],
        requestBody: {
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { note: { type: 'string' } } } } },
        },
        responses: { '200': json({ type: 'object' }) },
      },
    },
  })
  const { calls, findings } = readApiFile(file, {
    charge: 'GetChargesCharge',
    refund: 'POST /v1/refunds',
    upload: 'PostFiles',
  })
  assert.deepEqual(Object.keys(calls).sort(), ['charge', 'refund', 'upload'])
  const charge = calls.charge as Record<string, unknown>
  assert.deepEqual(charge.input, {
    charge: { kind: 'text' },
    expand: { kind: 'list', optional: true, of: { kind: 'text' } },
    'X-Tenant': { kind: 'text' },
  })
  assert.deepEqual(charge.query, ['expand'])
  assert.deepEqual(charge.headers, { 'X-Tenant': 'X-Tenant' })
  const refund = calls.refund as Record<string, unknown>
  assert.equal(refund.body, 'form')
  assert.deepEqual(refund.input, { charge: { kind: 'text' } })
  const upload = calls.upload as Record<string, unknown>
  assert.equal(upload.body, 'files')
  assert.deepEqual(upload.query, ['purpose'])
  assert.deepEqual(
    findings.filter((one) => one.level === 'error'),
    [],
  )
})

test('[24-5] an operation that is not there, a file of another version, a file that is no JSON, two calls of one name, and a parameter and a body field of one name are each T7013, an error', () => {
  const file = fileOf({
    '/a': { get: { operationId: 'GetA', responses: {} } },
    '/b': { get: { operationId: 'getA', responses: {} } },
    '/c': {
      post: {
        operationId: 'PostC',
        parameters: [{ name: 'id', in: 'query', schema: { type: 'string' } }],
        requestBody: json({ type: 'object', properties: { id: { type: 'string' } } }),
        responses: {},
      },
    },
  })
  const errorsOf = (found: ReturnType<typeof readApiFile>) =>
    found.findings.filter((one) => one.level === 'error').map((one) => one.code)
  assert.deepEqual(errorsOf(readApiFile(file, ['Missing'])), ['T7013'])
  assert.deepEqual(errorsOf(readApiFile(fileOf({}, {}, '2.0'), ['GetA'])), ['T7013'])
  assert.deepEqual(errorsOf(readApiFile({ swagger: '2.0', paths: {} }, ['GetA'])), ['T7013'])
  assert.deepEqual(errorsOf(readApiFile('{ not json', ['GetA'])), ['T7013'])
  assert.deepEqual(errorsOf(readApiFile(file, ['GetA', 'getA'])), ['T7013'])
  assert.deepEqual(errorsOf(readApiFile(file, ['PostC'])), ['T7013'])
  // An operation id that is no name of ours needs a key of `use`, which names it.
  const odd = fileOf({ '/d': { get: { operationId: 'get-d', responses: {} } } })
  assert.deepEqual(errorsOf(readApiFile(odd, ['get-d'])), ['T7013'])
  assert.deepEqual(errorsOf(readApiFile(odd, { getD: 'get-d' })), [])
})

test('[24-5] what no used call needs is never looked at, so a part of the file that is broken breaks nothing; a reference that leads out of the file is a warning', () => {
  const file = fileOf(
    {
      '/good': {
        get: {
          operationId: 'GetGood',
          responses: { '200': json({ $ref: 'other.json#/Thing' }) },
        },
      },
      '/broken': { get: { operationId: 'GetBroken', parameters: 'not a list', responses: 7 } },
    },
    { Broken: { $ref: '#/components/schemas/Nowhere' } },
  )
  const { calls, findings } = readApiFile(file, ['GetGood'])
  assert.deepEqual((calls.getGood as Record<string, unknown>).output, { kind: 'json' })
  assert.deepEqual(
    findings.map((one) => [one.code, one.level]),
    [['T7013', 'warning']],
  )
  assert.match(findings[0].message, /other\.json/)
})

test('[24-5] version 3.0 is read as 3.1 is, and the same file and `use` give the same calls each time', () => {
  const file = fileOf(
    {
      '/a': {
        get: {
          operationId: 'GetA',
          responses: { '200': json({ type: 'object', properties: { b: { type: 'string' } } }) },
        },
      },
    },
    {},
    '3.0.3',
  )
  const first = readApiFile(file, ['GetA'])
  assert.deepEqual(first.findings, [])
  assert.deepEqual(first, readApiFile(JSON.parse(JSON.stringify(file)), ['GetA']))
})
