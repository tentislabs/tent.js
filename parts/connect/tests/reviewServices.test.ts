import assert from 'node:assert/strict'
import type { ServerResponse } from 'node:http'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import { get, project, secret, service, text, TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { describe } from '../../core/internal.ts'
import type { ConnectEnv, Tokens } from '../env.ts'
import { guardedFetch } from '../guardedFetch.ts'
import { revoke } from '../oauth.ts'
import { createServices } from '../services.ts'
import { calling } from './calling.ts'
import { standIn } from './servers.ts'

const ok = (_: unknown, response: ServerResponse) => {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end('{}')
}

const ada: Caller = { kind: 'user', user: { id: 'ada', roles: [] } }

/** What a test of a connection was handed and did: the tokens it keeps, by service, user and account. */
interface Connected {
  env: ConnectEnv
  description: Description
  kept: Map<string, Tokens | undefined>
}

/** The env of `connect` over definitions held in memory, in the mode development, with tokens a test hands it. */
function connectedEnv(definitions: object[], tokens: Record<string, Tokens>): Connected {
  const described = describe({
    definitions: [{ value: project('testedApp', {}) }, ...definitions.map((value) => ({ value }))],
  })
  const errors = described.findings.filter((one) => one.level === 'error')
  if (errors.length) throw new Error(`the definitions do not describe: ${errors.map((one) => one.message)}`)
  const kept = new Map<string, Tokens | undefined>(Object.entries(tokens))
  const env: ConnectEnv = {
    description: () => described.description,
    fetch: guardedFetch({ mode: 'development', bodyTravels: true }),
    secret: (name) => `the ${name}`,
    tokens: {
      read: (one, user, account) => kept.get(`${one}/${user}/${account}`),
      write: (one, user, account, made) => void kept.set(`${one}/${user}/${account}`, made),
    },
    signers: {},
    verifiers: {},
    once: () => undefined,
    files: {
      stream: async () => new Blob([]).stream(),
      info: () => ({ name: 'none', kind: 'text/plain', size: 0 }),
      put: async () => 'f1',
    },
    logged: () => undefined,
    now: () => Date.UTC(2032, 0, 1),
    sleep: async () => undefined,
  }
  return { env, description: described.description, kept }
}

test('[05-11.4] a value for a place in the path that is a dot or two dots alone, in any form of percent signs, is T0002 that names its field, and a dot among other letters stays one part of the address', async (t) => {
  const server = await standIn(t, ok)
  const { call } = calling([
    service('shop', { url: server.origin, calls: { one: get('/orders/{id}/lines', { input: { id: text() } }) } }),
  ])
  for (const id of ['..', '.', '%2e', '%2E', '%2e%2E', '.%2e', '%2E.']) {
    const refused = await call('shop', 'one', { id }).then(
      () => 'sent',
      (error: unknown) => (error instanceof TentError ? [error.code, Object.keys(error.fields ?? {})] : error),
    )
    assert.deepEqual(refused, ['T0002', ['id']], id)
  }
  assert.equal(server.asked.length, 0, 'nothing is sent')
  for (const id of ['a.b', '...', '.hidden', '..a']) await call('shop', 'one', { id })
  assert.equal(server.asked.length, 4)
  for (const one of server.asked) assert.match(one.path, /^\/orders\/[^/?#]+\/lines$/, one.path)
})

test('[24-6] with `revokeUrl`, ending a connection posts the tokens there: the renewal token as well as the access token', async (t) => {
  const server = await standIn(t, ok)
  const { env } = connectedEnv(
    [
      service('github', {
        url: server.origin,
        auth: {
          oauth: {
            authorizeUrl: `${server.origin}/authorize`,
            tokenUrl: `${server.origin}/token`,
            revokeUrl: `${server.origin}/revoke`,
            clientId: secret('GITHUB_ID'),
            clientSecret: secret('GITHUB_SECRET'),
            scopes: ['repo'],
          },
        },
        calls: {},
      }),
    ],
    {},
  )
  await revoke(env, {
    service: 'github',
    version: 'v1',
    tokens: { access: 'the-access', refresh: 'the-renewal', scopes: [] },
  })
  const posted = server.asked.filter((one) => one.path === '/revoke').map((one) => one.body)
  assert.ok(
    posted.some((body) => body.includes('the-access')),
    posted.join(' | '),
  )
  assert.ok(
    posted.some((body) => body.includes('the-renewal')),
    `the renewal token stays good at the provider: ${posted.join(' | ')}`,
  )
})

test('[25-11] a tool call of an outside server whose `oauth` token is answered 401 renews it once and is made again, as a service call is', async (t) => {
  const server = await standIn(t, (request, response, asked) => {
    if (asked.path === '/token') {
      response.writeHead(200, { 'content-type': 'application/json' })
      return response.end(JSON.stringify({ access_token: 'renewed', refresh_token: 'r2', expires_in: 3600 }))
    }
    if (request.headers.authorization !== 'Bearer renewed') {
      response.writeHead(401, { 'www-authenticate': 'Bearer' })
      return response.end()
    }
    const id = Reflect.get(Object(JSON.parse(asked.body)), 'id')
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'found' }] } }))
  })
  const { env, description, kept } = connectedEnv(
    [
      service('docs', {
        url: `${server.origin}/mcp`,
        mcp: true,
        auth: {
          oauth: {
            authorizeUrl: `${server.origin}/authorize`,
            tokenUrl: `${server.origin}/token`,
            clientId: secret('DOCS_ID'),
            clientSecret: secret('DOCS_SECRET'),
            scopes: [],
          },
        },
      }),
    ],
    { 'docs/ada/': { access: 'ended', refresh: 'r1', scopes: [] } },
  )
  // The calls of an outside server are the tools that `mcp.lock.json` approved, which the build fills in.
  description.services.docs.calls = { search: { about: 'Searches', schema: { type: 'object' }, fingerprint: 'x' } }
  const services = createServices(env)
  let answer: unknown
  try {
    answer = await services.call(
      'docs',
      'search',
      {},
      { caller: ada, version: 'v1', signal: new AbortController().signal },
    )
  } catch (error) {
    answer = error instanceof TentError ? `${error.code}: ${error.message}` : error
  }
  assert.equal(answer, 'found')
  assert.equal(kept.get('docs/ada/')?.access, 'renewed')
})
