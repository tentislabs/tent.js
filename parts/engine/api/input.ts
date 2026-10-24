import { TentError } from '../../core/index.ts'
import { bodyOf } from '../web/body.ts'
import { readJson } from '../web/json.ts'
import { isWritten } from '../../core/internal.ts'

/** One value written after the question mark, read by the type of its field. */
function valueOf(type: unknown, written: string): unknown {
  const kind: unknown = Reflect.get(Object(type), 'kind')
  if (kind === 'number') return written.trim() !== '' && !Number.isNaN(Number(written)) ? Number(written) : written
  if (kind === 'boolean') return written === 'true' ? true : written === 'false' ? false : written
  if (kind === 'object' || kind === 'json' || kind === 'vector' || kind === 'map' || kind === 'oneOf')
    try {
      return JSON.parse(written)
    } catch {
      return written
    }
  return written
}

/**
 * The input of a `GET` of the API: one name after the question mark for each field. Text, a choice, a link, a day
 * and a file id are taken as they are, a number, true or false and a date as text, a list as its name once for each
 * entry, and an object, a `json` or a vector as JSON text. Throws T0002 for a name given twice for a field that is
 * no list. The door checks what it answers, as any input.
 */
export function queryInput(input: unknown, asked: URLSearchParams): Record<string, unknown> {
  const fields = isWritten(input) ? input : {}
  const read: Record<string, unknown> = {}
  for (const name of new Set(asked.keys())) {
    const all = asked.getAll(name)
    const type: unknown = Object.hasOwn(fields, name) ? fields[name] : undefined
    if (Reflect.get(Object(type), 'kind') === 'list') {
      const of: unknown = Reflect.get(Object(type), 'of')
      read[name] = all.map((one) => valueOf(of, one))
      continue
    }
    if (all.length > 1)
      throw new TentError('T0002', `\`${name.slice(0, 40)}\` was given ${all.length} times, and is no list.`, {
        fields: { [name.slice(0, 40)]: 'type' },
        fix: 'Give a field that is no list once.',
      })
    read[name] = valueOf(type, all[0])
  }
  return read
}

/**
 * The input of a `POST` of the API: the body, one JSON object, stated as `Content-Type: application/json`. An
 * empty body is no input. Throws T0002 for any other body, and T0003 for one over the size of a call.
 */
export async function bodyInput(request: Request, size: number): Promise<unknown> {
  const bytes = await bodyOf(request, size)
  if (!bytes.length) return {}
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json')
    throw new TentError('T0002', 'The body of a call to the API is JSON, stated as `Content-Type: application/json`.', {
      fields: { '': 'type' },
    })
  const body = readJson(bytes)
  if (!isWritten(body))
    throw new TentError('T0002', 'The body of a call to the API is the input itself, as one JSON object.', {
      fields: { '': 'type' },
    })
  return body
}
