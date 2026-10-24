import type { TestContext } from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

/** The project of the keys and the API, as a test app that is closed when the test ends. */
export async function keyedApp(t: TestContext): Promise<TestApp> {
  const app = await testApp({
    folder: copyOf(t, 'keyed'),
    secrets: { GITHUB_ID: 'the id of the app', GITHUB_SECRET: 'the secret of the app' },
  })
  closing(t, () => app.close())
  return app
}

/** A key made with what a test says, as the system makes it: its id and the key itself. */
export async function keyOf(app: TestApp, o: Record<string, unknown>): Promise<{ id: string; key: string }> {
  const made = Object(await app.as('system').call('makeKey', { o: { name: 'a key of a test', ...o } }))
  return { id: String(made.id), key: String(made.key) }
}

/** What a request of a test states: a key, its body, more headers, and the address it comes from. */
export interface Sent {
  key?: string
  body?: string | Uint8Array<ArrayBuffer>
  headers?: Record<string, string>
  from?: string
}

/** Sends one request to the app with no network, and answers the response. */
export function sent(app: TestApp, method: string, path: string, o: Sent = {}): Promise<Response> {
  return app.request(
    new Request(`http://localhost${path}`, {
      method,
      headers: { ...(o.key ? { authorization: `Bearer ${o.key}` } : {}), ...o.headers },
      ...(o.body === undefined ? {} : { body: o.body }),
    }),
    o.from ? { from: o.from } : {},
  )
}

/** Calls a function at `/_t/call/` as a program would, with a key and JSON. Answers the wire form. */
export async function called(
  app: TestApp,
  name: string,
  input: unknown,
  key?: string,
): Promise<Record<string, unknown>> {
  const answer = await sent(app, 'POST', `/_t/call/${name}`, {
    ...(key ? { key } : {}),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  return Object(await answer.json())
}

/** Calls a function at `/api/` with a key and JSON. Answers the status and what the body reads as. */
export async function api(
  app: TestApp,
  method: string,
  path: string,
  o: Sent & { input?: unknown } = {},
): Promise<{ status: number; headers: Headers; body: unknown }> {
  const answer = await sent(app, method, `/api/${path}`, {
    ...o,
    headers: { ...(o.input === undefined ? {} : { 'content-type': 'application/json' }), ...o.headers },
    ...(o.input === undefined ? {} : { body: JSON.stringify(o.input) }),
  })
  const text = await answer.text()
  let body: unknown = text
  try {
    body = text === '' ? undefined : JSON.parse(text)
  } catch {
    body = text
  }
  return { status: answer.status, headers: answer.headers, body }
}
