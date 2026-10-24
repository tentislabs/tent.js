import type { CallContext } from '../context.ts'
import { within } from '../context.ts'
import { keepMade, onWorker, passedWhere } from '../flows/leave.ts'

/** What is kept of an answer of a `fetch`: its status, its headers and the bytes of its body in base64. */
interface KeptAnswer {
  status: number
  headers: [string, string][]
  body: string
}

/** Whether a kept value is what a `fetch` kept. */
const isKeptAnswer = (value: unknown): value is KeptAnswer =>
  typeof Reflect.get(Object(value), 'status') === 'number' && typeof Reflect.get(Object(value), 'body') === 'string'

/** Takes what was kept of the answer of a `fetch`. Answers a response made of its status, its headers and its bytes. */
export function responseOfKept(kept: unknown): Response {
  if (!isKeptAnswer(kept)) return new Response(null)
  const body = kept.status === 204 || kept.status === 304 ? null : Buffer.from(kept.body, 'base64')
  return new Response(body, kept)
}

/** Takes the response of a `fetch`. Answers what is kept of it as plain data, and leaves the response to be read. */
export async function keptOfResponse(answer: Response): Promise<KeptAnswer> {
  const body = Buffer.from(await answer.clone().arrayBuffer()).toString('base64')
  return { status: answer.status, headers: [...answer.headers.entries()], body }
}

/**
 * Takes the call context of a `fetch` of backend code under a tool call that sends nothing out, and the fetch.
 * Answers its response, made where a person agreed to it at its place: a later making of the step is handed a
 * response made of the status, the headers and the bytes of the body that were kept. Throws T7111 with its place
 * where nobody agreed. On a worker the `may` and the `did` of the fetch carry the yes and what is kept.
 */
export async function fetchHeld(cx: CallContext, make: (cx: CallContext) => Promise<Response>): Promise<Response> {
  const pass = passedWhere(cx, 'fetch', 'sends')
  if ('kept' in pass) return responseOfKept(pass.kept)
  const answer = await within(pass.cx, () => make(pass.cx))
  if (pass.place && !onWorker(pass.cx)) keepMade(pass.cx, pass.place, await keptOfResponse(answer))
  return answer
}
