import assert from 'node:assert/strict'
import { request } from 'node:http'
import { test } from 'node:test'
import { running } from './apps.ts'

/** Sends one request over a real connection to a port of this computer, with the headers as they are given. */
function sent(
  port: number,
  o: { method: string; path: string; headers: Record<string, string>; body?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((done, failed) => {
    const asking = request(
      { host: '127.0.0.1', port, method: o.method, path: o.path, headers: o.headers },
      (answer) => {
        const parts: Buffer[] = []
        answer.on('data', (part: Buffer) => parts.push(part))
        answer.on('end', () => {
          let body: Record<string, unknown> = {}
          try {
            body = Object(JSON.parse(Buffer.concat(parts).toString('utf8')))
          } catch {
            // An answer that is no JSON is read by its status alone.
          }
          done({ status: answer.statusCode ?? 0, body })
        })
      },
    )
    asking.on('error', failed)
    asking.end(o.body)
  })
}

test('[21-21a] behind a named proxy that writes the forwarded host, a request with a body finds its app by that host, as a request with none does', async (t) => {
  const run = await running(t, {
    engine: { proxy: { from: ['127.0.0.1'], host: true } },
    open: { address: 'shop.example' },
  })
  // The proxy asks with a name of its own, and writes the name that was asked of it beside.
  const forwarded = { host: 'inner.local', 'x-forwarded-host': 'shop.example', 'x-forwarded-for': '9.9.9.9' }
  assert.equal((await sent(run.port, { method: 'GET', path: '/_t/health', headers: forwarded })).status, 200)
  const body = '{"input":{}}'
  const posted = await sent(run.port, {
    method: 'POST',
    path: '/_t/call/publicTags',
    headers: { ...forwarded, 'content-type': 'application/json', 'content-length': String(body.length) },
    body,
  })
  assert.deepEqual([posted.status, posted.body.ok], [200, true], JSON.stringify(posted.body))
  // A body that says it is larger than a call may be is refused as that, before it is read, and not as a wrong name.
  const refused = await sent(run.port, {
    method: 'POST',
    path: '/_t/call/publicTags',
    headers: { ...forwarded, 'content-type': 'application/json', 'content-length': '99999999' },
  })
  assert.equal(Object(refused.body.error).code, 'T0003', JSON.stringify(refused.body).slice(0, 200))
  // With no forwarded host the name of the proxy names no app, with a body and with none.
  const own = { host: 'inner.local', 'content-type': 'application/json', 'content-length': String(body.length) }
  const unnamed = await sent(run.port, { method: 'POST', path: '/_t/call/publicTags', headers: own, body })
  assert.deepEqual([unnamed.status, Object(unnamed.body.error).code], [421, 'T0017'])
})
