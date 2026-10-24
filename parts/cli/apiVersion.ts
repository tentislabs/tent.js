import { isStored } from '../core/internal.ts'

type Part = Record<string, unknown>

/** A value of the older version with each of its references moved to where version 3.1 keeps shapes. */
function moved(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(moved)
  if (!isStored(value)) return value
  const made: Part = {}
  for (const [key, one] of Object.entries(value))
    made[key] =
      key === '$ref' && typeof one === 'string' ? one.replace(/^#\/definitions\//, '#/components/schemas/') : moved(one)
  return made
}

/** The schema of a parameter of the older version, which states its type on itself. */
function schemaOf(parameter: Part): unknown {
  if (parameter.schema !== undefined) return moved(parameter.schema)
  const { name: _name, in: _in, required: _required, description: _description, ...rest } = parameter
  return moved(rest)
}

/** One operation of the older version, as version 3.1 writes it: parameters, a body by its kind, answers with content. */
function operationOf(operation: Part, consumes: unknown, produces: unknown): Part {
  const { parameters, responses, consumes: own, produces: answered, ...rest } = operation
  const kinds = Array.isArray(own) ? own : Array.isArray(consumes) ? consumes : []
  const answerKinds = Array.isArray(answered) ? answered : Array.isArray(produces) ? produces : []
  const answerKind = String(answerKinds.find((one) => /json/.test(String(one))) ?? 'application/json')
  const kept: Part[] = []
  let body: Part | undefined
  const form: Part = {}
  const required: string[] = []
  for (const one of Array.isArray(parameters) ? parameters : []) {
    if (!isStored(one)) continue
    if (one.in === 'body') body = { content: { 'application/json': { schema: moved(one.schema) } } }
    else if (one.in === 'formData') {
      form[String(one.name)] = one.type === 'file' ? { type: 'string', format: 'binary' } : schemaOf(one)
      if (one.required === true) required.push(String(one.name))
    } else kept.push({ name: one.name, in: one.in, required: one.required === true, schema: schemaOf(one) })
  }
  if (Object.keys(form).length) {
    const kind = kinds.includes('multipart/form-data') ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
    body = {
      content: { [kind]: { schema: { type: 'object', properties: form, ...(required.length ? { required } : {}) } } },
    }
  }
  const answers: Part = {}
  for (const [status, answer] of Object.entries(isStored(responses) ? responses : {})) {
    if (!isStored(answer)) continue
    const { schema, ...more } = answer
    answers[status] = {
      ...more,
      ...(schema === undefined ? {} : { content: { [answerKind]: { schema: moved(schema) } } }),
    }
  }
  const others = moved(rest)
  return {
    ...(isStored(others) ? others : {}),
    ...(kept.length ? { parameters: kept } : {}),
    ...(body ? { requestBody: body } : {}),
    responses: answers,
  }
}

const methods = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options']

/**
 * Takes a description of an API as it was read. Answers it in version 3.0 or 3.1, which the build reads: a file of
 * either is answered as it is, and one of the version before 3.0 is turned into 3.1, with its shapes under
 * `components`, each body and answer as content of its kind. Answers nothing for any other.
 */
export function inVersion31(read: unknown): Part | undefined {
  if (!isStored(read)) return undefined
  if (typeof read.openapi === 'string' && /^3\.[01](\.|$)/.test(read.openapi)) return read
  if (read.swagger !== '2.0') return undefined
  const paths: Part = {}
  for (const [path, item] of Object.entries(isStored(read.paths) ? read.paths : {})) {
    if (!isStored(item)) continue
    const made: Part = {}
    for (const [key, value] of Object.entries(item))
      if (methods.includes(key) && isStored(value)) made[key] = operationOf(value, read.consumes, read.produces)
      else if (key === 'parameters' && Array.isArray(value))
        made.parameters = value
          .filter(isStored)
          .map((one) => ({ name: one.name, in: one.in, required: one.required === true, schema: schemaOf(one) }))
    paths[path] = made
  }
  return {
    openapi: '3.1.0',
    info: read.info ?? { title: '', version: '' },
    paths,
    components: { schemas: moved(isStored(read.definitions) ? read.definitions : {}) },
  }
}
