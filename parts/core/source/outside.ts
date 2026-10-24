import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import type { Doc } from './doc.ts'
import { called, recordDoc } from './doc.ts'
import type { Form } from './plain.ts'
import { entryDocs, plainDoc, triesForm } from './plain.ts'
import { filterDoc } from './plan.ts'
import { keyText, quoted } from './texts.ts'
import type { Writing } from './writing.ts'
import { naming, ours } from './writing.ts'
import { marked } from './marked.ts'

// The words that make a call of a service, each by the method it stands for.
const methods: Record<string, string> = { GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'del' }

/** One call of a service as its word: the method, the path, and what the call states beside. */
function callDoc(w: Writing, call: Stored): Doc {
  const { method, path, ...more } = call
  const word = ours(w, methods[String(method)] ?? 'request')
  const options = entryDocs(w, more, { input: 'types', output: 'type' })
  const rest = options.length ? [recordDoc(options)] : []
  return word === 'request'
    ? called(word, [quoted(String(method)), quoted(String(path)), ...rest])
    : called(word, [quoted(String(path)), ...rest])
}

/** A call of a service that is handed on: the service, a dot, and the call. */
const serviceCall: Form = (w, value) =>
  isStored(value) ? `${naming(w, String(value.service))}.${value.call}` : plainDoc(w, value)

/** The options of a service, in the order they are written. The calls that a file or an outside server gave are never written. */
export function serviceEntries(w: Writing, service: Stored): Doc[] {
  // A call that the file of `from` gave is one that `from` names, and one of an outside server holds its schema.
  const given: unknown = isStored(service.from) ? service.from.calls : undefined
  const used = Array.isArray(given) ? given : []
  const written = ([name, call]: [string, unknown]): boolean =>
    isStored(call) && !used.includes(name) && !('schema' in call) && !('fingerprint' in call)
  return entryDocs(w, service, {
    url: 'plain',
    auth: 'plain',
    headers: 'plain',
    calls: (w, calls) => {
      const own = Object.entries(isStored(calls) ? calls : {}).filter(written)
      return own.length
        ? recordDoc(
            own.map(([name, call]) => [`${keyText(name)}: `, isStored(call) ? callDoc(w, call) : '{}']),
            true,
          )
        : undefined
    },
    from: (w, from) => plainDoc(w, isStored(from) ? from.file : from),
    use: 'plain',
    limits: Object.fromEntries(
      ['perSecond', 'perMinute', 'atOnce', 'size', 'error', 'redirects', 'time'].map((name) => [
        name,
        marked('services', '*', 'limits', name),
      ]),
    ),
    tries: triesForm,
    onceOnlyHeader: 'plain',
    webhook: 'plain',
    connection: 'name',
    mcp: 'plain',
    was: 'was',
  })
}

/** The options of a model, in the order they are written. */
export function modelEntries(w: Writing, model: Stored): Doc[] {
  // A model with a job states how long the whole job may take, also where that is what holds when it is left out.
  const limits = isStored(model.limits) ? model.limits : {}
  const stated = model.job === undefined ? model : { ...model, limits: { time: 60_000, ...limits } }
  return entryDocs(w, stated, {
    provider: 'plain',
    name: 'plain',
    key: 'plain',
    url: 'plain',
    abilities: 'plain',
    takes: 'plain',
    voices: 'plain',
    input: 'types',
    output: 'type',
    limits: { perDay: 'plain', perCallerPerDay: 'plain', time: marked('models', '*', 'limits', 'time') },
    tries: triesForm,
    fallback: 'names',
    options: (_w, options) => literal(options),
    countBy: 'plain',
    call: serviceCall,
    units: 'plain',
    job: {
      check: serviceCall,
      with: 'plain',
      done: (w, filter) => filterDoc(w, filter),
      failed: (w, filter) => filterDoc(w, filter),
      every: marked('models', '*', 'job', 'every'),
    },
    was: 'was',
  })
}

/** Any JSON as it stands: the options of a model are its provider's own, and no word of ours is read into them. */
function literal(value: unknown): Doc {
  if (typeof value === 'string') return quoted(value)
  if (Array.isArray(value)) return ['[', ...value.flatMap((one, k) => (k ? [', ', literal(one)] : [literal(one)])), ']']
  if (!isStored(value)) return String(value)
  return recordDoc(Object.entries(value).map(([key, one]) => [`${keyText(key)}: `, literal(one)]))
}
