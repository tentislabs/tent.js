import type { Caller } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import type { Visit } from '../visit.ts'
import { gather } from './gather.ts'

// What the bytes of a request are counted under, by the address it reached, where that is no definition.
const ofAddress: Record<string, string> = {
  bundle: 'static',
  part: 'static',
  files: 'files',
  file: 'files',
  img: 'files',
  live: 'live',
  copy: 'copy',
  copyBlob: 'copy',
  copyData: 'copy',
  copyDo: 'copy',
  copyFile: 'copy',
  copyTook: 'copy',
  copyVersions: 'copy',
  workBlob: 'work',
  workFile: 'work',
  workVersions: 'work',
}

// The addresses whose request names a definition, which the bytes are counted under.
const ofDefinition = ['call', 'api', 'form', 'read', 'route', 'incoming']

/** Whether a name is that of a definition of the app, or of a member of one of its agents. */
export function known(o: Opened, name: string): boolean {
  const { functions, flows, routes, incoming, models } = o.description
  const of = (name: string): boolean =>
    [functions, flows, routes, incoming, models].some((all) => Object.hasOwn(all, name))
  return of(name) || (name.includes('.') && of(name.slice(0, name.indexOf('.'))))
}

/**
 * Takes an app, the name of the address that a request reached, and what it read of the request. Answers what the
 * bytes of the request are counted under: the definition it names, a thing of the engine's own, or the door. A name
 * that is no definition of the app is the door's, so that nobody makes rows of the counts by the names they send.
 */
export function countedName(o: Opened, address: string, matched: object): string {
  const named: unknown = Reflect.get(matched, 'name')
  if (ofDefinition.includes(address)) return typeof named === 'string' && known(o, named) ? named : 'door'
  return Object.hasOwn(ofAddress, address) ? ofAddress[address] : 'door'
}

/** A body that counts its bytes as they pass, and tells the count when it has passed whole or was let go. */
export function counting(body: ReadableStream<Uint8Array>, told: (bytes: number) => void): ReadableStream<Uint8Array> {
  let bytes = 0
  let ended = false
  const end = (): void => {
    if (ended) return
    ended = true
    told(bytes)
  }
  const reader = body.getReader()
  return new ReadableStream<Uint8Array>(
    {
      async pull(line) {
        const part = await reader.read()
        if (part.done) {
          end()
          return line.close()
        }
        bytes += part.value.byteLength
        line.enqueue(part.value)
      },
      cancel(reason) {
        end()
        return reader.cancel(reason)
      },
      // Nothing is read ahead of whoever reads the body: a stream that ends when its last piece is taken ends then.
    },
    { highWaterMark: 0 },
  )
}

/** A request whose body counts the bytes the engine reads of it. */
export function countedRequest(request: Request, told: (bytes: number) => void): Request {
  if (!request.body) return request
  // A body that is a stream is sent one way, which a request must be told.
  const how: RequestInit & { duplex: 'half' } = {
    method: request.method,
    headers: request.headers,
    body: counting(request.body, told),
    signal: request.signal,
    duplex: 'half',
  }
  return new Request(request.url, how)
}

/**
 * Takes an app, the request of the web as the door answered it, the bytes read of the request so far, and the
 * answer. Answers the answer, whose body counts what is written of it, and books both under what the request
 * reached once the answer has passed: a request that reached no definition is also a call of the door, failed
 * where it was refused, and a file of the bundle a call of `static`.
 */
export function countedAnswer(o: Opened, here: Visit, read: () => number, answer: Response): Response {
  const name = here.counted?.name ?? 'door'
  // What no caller caused stands with the caller empty, whatever `countBy` says.
  const caller: Caller | undefined = ['door', 'static', 'copy', 'work'].includes(name)
    ? undefined
    : here.counted?.caller
  const book = (written: number): void => {
    const calls =
      name === 'door'
        ? { calls: 1, ...(answer.status >= 400 ? { failed: 1 } : {}) }
        : name === 'static'
          ? { calls: 1 }
          : {}
    gather(
      o,
      name,
      // An upload counts what comes in, and a download what goes out: what answers them is no file.
      {
        ...calls,
        ...(name === 'files' && here.request.method !== 'POST' ? {} : { bytesIn: read() }),
        ...(name === 'files' && here.request.method === 'POST' ? {} : { bytesOut: written }),
      },
      { ...(caller ? { caller } : {}), definition: name },
    )
  }
  if (!answer.body) {
    book(0)
    return answer
  }
  return new Response(counting(answer.body, book), {
    status: answer.status,
    statusText: answer.statusText,
    headers: answer.headers,
  })
}
