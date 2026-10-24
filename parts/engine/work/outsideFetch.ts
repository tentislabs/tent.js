import { TentError } from '../../core/index.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { fileRow, fileStore, forgetFile, putFile } from '../stored/files.ts'
import { headed } from '../web/headed.ts'
import type { Remote } from './remote.ts'
import type { OutTask } from './state.ts'
import { isStored } from '../../core/internal.ts'

/** The base64 of a body that fits in a frame with what goes beside it: three bytes are four characters. */
const inFrameBytes = (inFrame: number): number => Math.max(0, Math.floor((inFrame - 4096) * 0.75))

/**
 * A `fetch` that work on a worker makes, on a kind whose `outside` names `fetch`: the request crosses to the writer,
 * and the writer makes it through its own guarded fetch. A body that fits in a frame crosses in base64; a larger one
 * crosses as a file, posted by the worker and fetched from the writer. Answers the answer it got.
 */
export async function fetchedByWriter(o: Opened, remote: Remote, asked: Parameters<typeof fetch>): Promise<Response> {
  const request = new Request(...asked)
  const bytes = request.body ? new Uint8Array(await request.arrayBuffer()) : undefined
  const fits = bytes === undefined || bytes.byteLength <= inFrameBytes(storedLimit(o.description, 'inFrame'))
  const body = !bytes
    ? {}
    : !fits && remote.post
      ? { file: await remote.post(bytes) }
      : { body: Buffer.from(bytes).toString('base64') }
  const answer = await remote.ask({
    what: 'fetch',
    request: { url: request.url, method: request.method, headers: [...request.headers], ...body },
  })
  const got = isStored(answer) ? answer : {}
  const headers = Array.isArray(got.headers)
    ? got.headers.filter(Array.isArray).map((pair): [string, string] => [String(pair[0]), String(pair[1])])
    : []
  const status = typeof got.status === 'number' ? got.status : 502
  // A status that holds no body is answered with none.
  if (status === 204 || status === 205 || status === 304) return new Response(null, { status, headers })
  if (typeof got.file === 'string' && remote.bytes)
    return new Response(new Uint8Array(await remote.bytes(got.file)), { status, headers })
  return new Response(Buffer.from(typeof got.body === 'string' ? got.body : '', 'base64'), { status, headers })
}

/**
 * The writer's side of such a `fetch`: the request as the worker sent it, made through the `fetch` of the app, which
 * the wrap holds to the addresses the app may reach and logs in `outgoing`. A body that the worker posted is sent
 * as it is read, and the file is removed after. Answers its status, its headers and its body: in base64 where it
 * fits in a frame, and else as a file that the writer made for the task as the body arrived, held to
 * `limits.workFileSize` (T0003), which is removed with the task.
 */
export async function fetchForWorker(o: Opened, out: OutTask | undefined, sent: unknown): Promise<object> {
  const request = isStored(sent) ? sent : {}
  const lines = Array.isArray(request.headers)
    ? request.headers.filter(Array.isArray).map((pair): [string, string] => [String(pair[0]), String(pair[1])])
    : []
  const posted = typeof request.file === 'string' ? fileRow(o, request.file) : undefined
  if (typeof request.file === 'string' && (!posted || !out?.posted?.includes(posted.id)))
    throw new TentError('T5108', 'The file of the body was not posted for this task.')
  try {
    const answer = await fetch(String(request.url), {
      method: typeof request.method === 'string' ? request.method : 'GET',
      headers: lines,
      ...(posted
        ? { body: readable(fileStore(o).get(posted.fingerprint)), duplex: 'half' }
        : typeof request.body === 'string'
          ? { body: Buffer.from(request.body, 'base64') }
          : {}),
    })
    const head = { status: answer.status, headers: [...answer.headers] }
    if (!answer.body) return { ...head, body: '' }
    const { head: first, ended, all } = await headed(answer.body, inFrameBytes(storedLimit(o.description, 'inFrame')))
    if (ended) return { ...head, body: Buffer.from(first).toString('base64') }
    if (!out) {
      await all.cancel().catch(() => undefined)
      throw new TentError('T5108', 'The task of the fetch is not out to this worker.')
    }
    const made = await putFile(o, all, {
      name: 'fetched',
      kind: 'application/octet-stream',
      by: 'system',
      most: storedLimit(o.description, 'workFileSize'),
    })
    // The task names the file by its fingerprint, which its worker fetches, and it goes when the task ends.
    out.files = [...(out.files ?? []), made.fingerprint]
    out.made = [...(out.made ?? []), made.id]
    return { ...head, file: made.fingerprint }
  } finally {
    if (posted) await forgetFile(o, posted).catch(() => undefined)
  }
}

/** The parts of a stored file as a standard stream of bytes, read one part at a time. */
function readable(parts: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> {
  const each = parts[Symbol.asyncIterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await each.next()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    cancel: async () => void (await each.return?.()),
  })
}
