import type { Finding } from './errors.ts'
import { finding } from './finding.ts'
import { isStored, type Stored } from './record.ts'
import { keepAt, keptAt } from './stored/kept.ts'

const methods = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']

/** A name of ours: a letter, then letters and digits. */
const isName = (name: string): boolean => /^[A-Za-z][A-Za-z0-9]*$/.test(name)

/** The name of a call after its operation: the first letter made small. */
const callName = (operation: string): string => operation.charAt(0).toLowerCase() + operation.slice(1)

/**
 * What reading the types of one call needs: the file, what each part that had to be taken as `json` is told, and
 * the type each reference was read into, so a shape named many times over is followed once.
 */
interface Reading {
  file: Stored
  call: string
  warn(words: string): void
  read: Map<string, Stored>
}

/** Follows a reference inside the file. Nothing for one that leads out of it, or to nothing. */
function followed(r: Reading, ref: string): { found?: unknown; out: boolean } {
  if (!ref.startsWith('#/')) return { out: true }
  let at: unknown = r.file
  for (const raw of ref.slice(2).split('/')) {
    const piece = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    at = isStored(at) ? keptAt(at, piece) : undefined
  }
  return { found: at, out: false }
}

/**
 * Takes a reading, a schema of the file, the place it stands at for the words of a warning, and the references it
 * stands inside. Answers the stored record of the type it is read into: text, a choice, a date, a day, a number,
 * true or false, a list, a record; and `json` for everything else, which is warned of.
 */
function typeOf(r: Reading, schema: unknown, at: string, inside: string[] = []): Stored {
  const asJson = (why: string): Stored => {
    r.warn(`${at} of ${r.call} is taken as \`json\`: ${why}.`)
    return { kind: 'json' }
  }
  if (!isStored(schema)) return asJson('the file gives it no shape')
  if (typeof schema.$ref === 'string') {
    if (inside.includes(schema.$ref)) return asJson('its shape holds itself')
    const held = r.read.get(schema.$ref)
    if (held) return held
    const { found, out } = followed(r, schema.$ref)
    if (out) {
      r.warn(`${at} of ${r.call} names ${schema.$ref}, which leads out of the file, and is taken as \`json\`.`)
      return { kind: 'json' }
    }
    if (found === undefined) return asJson(`${schema.$ref} names nothing in the file`)
    const type = typeOf(r, found, at, [...inside, schema.$ref])
    r.read.set(schema.$ref, type)
    return type
  }
  if (schema.oneOf !== undefined || schema.anyOf !== undefined || schema.allOf !== undefined)
    return asJson('it is a choice between shapes')
  const stated = Array.isArray(schema.type) ? schema.type.filter((one) => one !== 'null') : [schema.type]
  if (stated.length !== 1) return asJson('it may be of several kinds')
  switch (stated[0]) {
    case 'string':
      if (Array.isArray(schema.enum) && schema.enum.every((one) => typeof one === 'string'))
        return { kind: 'choice', values: schema.enum }
      if (schema.format === 'date-time') return { kind: 'date' }
      if (schema.format === 'date') return { kind: 'day' }
      return { kind: 'text' }
    case 'number':
      return { kind: 'number' }
    case 'integer':
      return { kind: 'number', whole: true }
    case 'boolean':
      return { kind: 'boolean' }
    case 'array':
      return { kind: 'list', of: typeOf(r, schema.items, `${at}[]`, inside) }
    case 'object': {
      if (!isStored(schema.properties) || Object.keys(schema.properties).length === 0)
        return asJson('it holds keys of its own choosing')
      if (schema.additionalProperties !== undefined && schema.additionalProperties !== false)
        return asJson('it holds keys of its own choosing')
      const required = Array.isArray(schema.required) ? schema.required : []
      const shape: Stored = {}
      for (const [name, inner] of Object.entries(schema.properties))
        keepAt(shape, name, optionalIf(typeOf(r, inner, `${at}.${name}`, inside), !required.includes(name)))
      return { kind: 'object', shape }
    }
    default:
      return asJson('the file names no kind the framework has')
  }
}

/** A stored type made optional where it may be left out. */
const optionalIf = (type: Stored, optional: boolean): Stored => (optional ? { ...type, optional: true } : type)

/** The parameters of an operation and of its path, where the operation's own win over those of the path by name and place. */
function parametersOf(r: Reading, path: Stored, operation: Stored): Stored[] {
  const all: Stored[] = []
  for (const list of [path.parameters, operation.parameters])
    for (const one of Array.isArray(list) ? list : []) {
      const read = isStored(one) && typeof one.$ref === 'string' ? followed(r, one.$ref).found : one
      if (!isStored(read)) continue
      const at = all.findIndex((held) => held.name === read.name && held.in === read.in)
      if (at >= 0) all[at] = read
      else all.push(read)
    }
  return all
}

/** The schema of a body or of an answer that the file gives as content, by its kind. */
function contentOf(r: Reading, part: unknown): { kind: string; schema: unknown } | undefined {
  const read = isStored(part) && typeof part.$ref === 'string' ? followed(r, part.$ref).found : part
  if (!isStored(read) || !isStored(read.content)) return undefined
  const kinds = Object.keys(read.content)
  const kind =
    kinds.find((one) => /json/.test(one)) ??
    kinds.find((one) => one === 'application/x-www-form-urlencoded') ??
    kinds.find((one) => one === 'multipart/form-data') ??
    kinds[0]
  const held = read.content[kind]
  return kind === undefined ? undefined : { kind, schema: isStored(held) ? held.schema : undefined }
}

/**
 * Takes a file of a published description of an API, as text or as the value it reads as, and the operations that
 * `use` names: a list of their ids, or a record from the name of a call to an id or to a method and a path. Answers
 * the record of each call, as a service stores it, and the findings, all T7013: an error where the file cannot be
 * read, is of another version, lacks a named operation, or gives two calls or two fields one name; a warning for a
 * part of a used call that had to be taken as `json`, and for a reference that leads out of the file. Nothing of the
 * file but the named operations is looked at.
 */
export function readApiFile(
  json: unknown,
  use: string[] | Record<string, string>,
): { calls: Record<string, object>; findings: Finding[] } {
  const findings: Finding[] = []
  const error = (words: string): void =>
    void findings.push(
      finding('T7013', words, { fix: 'Mend the file or `use`, so that every named operation is read.' }),
    )
  const warn = (words: string): void =>
    void findings.push(
      finding('T7013', words, { fix: 'Write the call by hand in `calls` where its type matters.' }, 'warning'),
    )
  let file: unknown = json
  if (typeof json === 'string')
    try {
      file = JSON.parse(json)
    } catch {
      error('The file cannot be read as JSON. A file in YAML is turned into JSON with `tent api read`.')
      return { calls: {}, findings }
    }
  if (!isStored(file) || typeof file.openapi !== 'string' || !/^3\.[01]\./.test(`${file.openapi}.`)) {
    error('The file is no description of an API in version 3.0 or 3.1. `tent api read` turns an older one into 3.1.')
    return { calls: {}, findings }
  }
  const paths = isStored(file.paths) ? file.paths : {}
  const asked: [string | undefined, string][] = Array.isArray(use)
    ? use.map((one) => [undefined, one])
    : Object.entries(use)
  const calls: Record<string, object> = {}
  for (const [key, operationName] of asked) {
    let found: { method: string; path: string; path_: Stored; operation: Stored } | undefined
    const spaced = /^([A-Za-z]+)\s+(\/\S*)$/.exec(operationName)
    for (const [path, item] of Object.entries(paths)) {
      if (!isStored(item)) continue
      for (const method of methods) {
        const operation = item[method]
        if (!isStored(operation)) continue
        const byId = operation.operationId === operationName
        const byPlace = spaced !== null && spaced[1].toLowerCase() === method && spaced[2] === path
        if (byId || byPlace) found = { method: method.toUpperCase(), path, path_: item, operation }
      }
    }
    if (!found) {
      error(`The file holds no operation ${operationName}, which \`use\` names.`)
      continue
    }
    const id = typeof found.operation.operationId === 'string' ? found.operation.operationId : undefined
    const name = key ?? (id ? callName(id) : undefined)
    if (name === undefined || !isName(name)) {
      error(
        `The operation ${operationName} has no id that is a name of ours: give its call a name, \`use: { name: '${operationName}' }\`.`,
      )
      continue
    }
    if (Object.hasOwn(calls, name)) {
      error(`Two calls get the name ${name}.`)
      continue
    }
    const r: Reading = { file, call: name, warn, read: new Map() }
    const input: Stored = {}
    const query: string[] = []
    const headers: Record<string, string> = {}
    for (const parameter of parametersOf(r, found.path_, found.operation)) {
      const field = String(parameter.name)
      if (!['path', 'query', 'header'].includes(String(parameter.in))) continue
      keepAt(
        input,
        field,
        optionalIf(typeOf(r, parameter.schema, field), parameter.in !== 'path' && parameter.required !== true),
      )
      if (parameter.in === 'query') query.push(field)
      if (parameter.in === 'header') keepAt(headers, field, field)
    }
    const body = contentOf(r, found.operation.requestBody)
    let bodyKind: string | undefined
    let clash = false
    if (body) {
      bodyKind =
        body.kind === 'application/x-www-form-urlencoded'
          ? 'form'
          : body.kind === 'multipart/form-data'
            ? 'files'
            : undefined
      const read = typeOf(r, body.schema, 'the body')
      if (read.kind === 'object' && isStored(read.shape))
        for (const [field, type] of Object.entries(read.shape)) {
          if (Object.hasOwn(input, field)) clash = true
          keepAt(input, field, type)
        }
    }
    if (clash) {
      error(`A parameter and a field of the body of ${name} have one name.`)
      continue
    }
    const responses = isStored(found.operation.responses) ? found.operation.responses : {}
    const answer = contentOf(r, responses['200'] ?? responses['201'])
    const output = answer ? typeOf(r, answer.schema, 'the answer') : undefined
    calls[name] = {
      method: found.method,
      path: found.path,
      ...(bodyKind ? { body: bodyKind } : {}),
      ...(query.length ? { query } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(Object.keys(input).length ? { input } : {}),
      ...(output ? { output } : {}),
      ...(typeof found.operation.summary === 'string' && found.operation.summary !== ''
        ? { about: found.operation.summary }
        : {}),
    }
  }
  return { calls, findings }
}
