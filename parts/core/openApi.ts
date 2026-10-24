import { answerOf } from './answerOf.ts'
import type { Description } from './description.ts'
import { isStored } from './record.ts'
import { isRequired } from './required.ts'
import { toJsonSchema } from './toJsonSchema.ts'
import type { Type } from './type.ts'
import { object } from './types/object.ts'

// The kinds of a field that the address of a `GET` can carry after its question mark.
const plain = ['text', 'number', 'boolean', 'date', 'day', 'choice', 'link']

const isType = (value: unknown): value is Type => isStored(value) && typeof value.kind === 'string'

/** Whether a field can stand after the question mark: a plain kind, or a list of one. */
const asked = (type: unknown): boolean => {
  if (!isStored(type)) return false
  if (type.kind === 'list') return isStored(type.of) && plain.includes(String(type.of.kind))
  return plain.includes(String(type.kind))
}

/** One function, flow or agent that is offered to the API, with what its operation is made of. */
export interface Offered {
  name: string
  record: Record<string, unknown>
  query: boolean
}

/** Every function and flow that states `offer: ['api']`, by its name, in the order of the names. */
export function offeredToApi(description: Description): Offered[] {
  const found: Offered[] = []
  for (const [name, record] of [...Object.entries(description.functions), ...Object.entries(description.flows)])
    if (Array.isArray(record.offer) && record.offer.includes('api'))
      found.push({ name, record, query: record.kind === 'query' })
  return found.sort((a, b) => (a.name < b.name ? -1 : 1))
}

/** The name under which a function is reached at `/api/`: its own, or what `api.names` of the project gives it. */
export function apiNameOf(description: Description, name: string): string {
  const names: unknown = Reflect.get(Object(description.project.api), 'names')
  const given: unknown = isStored(names) && Object.hasOwn(names, name) ? names[name] : undefined
  return typeof given === 'string' ? given : name
}

/** Whether a query is listed as a `GET`: every field of its input can stand after the question mark. */
export function listedAsGet(one: Offered): boolean {
  if (!one.query) return false
  const input = isStored(one.record.input) ? one.record.input : {}
  return Object.values(input).every(asked)
}

/** The problem form of a failure, which every operation names. */
const problem = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    code: { type: 'string' },
    message: { type: 'string' },
    fields: { type: 'object', additionalProperties: { type: 'string' } },
    ref: { type: 'string' },
    fix: { type: 'string' },
  },
  required: ['type', 'title', 'status', 'code', 'message'],
}

/** The day that a function stated in `deprecated`, where it states one. */
const deprecatedOf = (record: Record<string, unknown>): string | undefined =>
  typeof record.deprecated === 'string' ? record.deprecated : undefined

/** The operation of one offered function: its input as the body or after the question mark, and its answer. */
function operationOf(description: Description, one: Offered, get: boolean): Record<string, unknown> {
  const input = isStored(one.record.input) ? one.record.input : {}
  const shape: Record<string, Type> = {}
  for (const [field, type] of Object.entries(input)) if (isType(type)) shape[field] = type
  const answer = answerOf(description, one.name)
  const fields = Object.keys(shape).sort()
  const operation: Record<string, unknown> = {
    operationId: one.name,
    ...(typeof one.record.about === 'string' ? { summary: one.record.about } : {}),
    ...(deprecatedOf(one.record) ? { deprecated: true } : {}),
  }
  if (get && fields.length)
    operation.parameters = fields.map((field) => {
      const schema: Record<string, unknown> = { ...toJsonSchema(shape[field]) }
      return {
        name: field,
        in: 'query',
        required: isRequired(shape[field]),
        schema,
        ...(Reflect.get(schema, 'type') === 'array' ? { explode: true } : {}),
      }
    })
  if (!get)
    operation.requestBody = {
      required: fields.some((field) => isRequired(shape[field])),
      content: { 'application/json': { schema: toJsonSchema(object(shape)) } },
    }
  operation.responses = {
    '200': {
      description: 'What it answers.',
      ...(answer ? { content: { 'application/json': { schema: toJsonSchema(answer) } } } : {}),
    },
    '204': { description: 'It answers nothing.' },
    default: { $ref: '#/components/responses/problem' },
  }
  return operation
}

/**
 * Takes a description. Answers the description of its API in version 3.1 of the standard: one operation for each
 * function, flow and agent that is offered to the API, a query as a `GET` where every field of its input can
 * stand after the question mark and as a `POST` otherwise, the problem form once, and a bearer key as its sign-in.
 */
export function openApiOf(description: Description): object {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const one of offeredToApi(description)) {
    const get = listedAsGet(one)
    paths[`/${apiNameOf(description, one.name)}`] = { [get ? 'get' : 'post']: operationOf(description, one, get) }
  }
  const title = typeof description.project.title === 'string' ? description.project.title : description.app.name
  return {
    openapi: '3.1.0',
    info: { title, version: description.format },
    servers: [{ url: '/api' }],
    paths,
    components: {
      schemas: { problem },
      responses: {
        problem: {
          description: 'A failure, in the standard form of a problem.',
          content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/problem' } } },
        },
      },
      securitySchemes: { key: { type: 'http', scheme: 'bearer' } },
    },
    security: [{ key: [] }],
  }
}
