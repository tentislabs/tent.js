import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TentError } from '../../core/index.ts'
import { addressWith } from '../guardedAddress.ts'
import { fetchWith } from '../guardedFetch.ts'
import { failure, names, refused, standIn } from './servers.ts'

test('[05-7.1] a name of this computer or of a private network is refused before any look-up, however it is written', async () => {
  for (const name of [
    'localhost',
    'LocalHost',
    'localhost.',
    'app.localhost',
    'APP.LOCALHOST.',
    'printer.local',
    'Printer.Local.',
    'db.internal',
    'metadata.google.internal',
    'DB.INTERNAL.',
    // Letters of another script and marks that the reader of addresses folds into the same name.
    'ｌｏｃａｌｈｏｓｔ',
    'local­host',
    'db。internal',
    'db.internａl',
    '%6cocalhost',
    'db.%69nternal',
    'db.internal%2e',
    'loc\talhost',
    'db.inter\nnal',
  ]) {
    const asks = names({})
    for (const mode of ['test', 'live'] as const) {
      await refused(fetchWith({ mode }, asks.lookup)(`https://${name}/`), 'private')
      await refused(fetchWith({ mode, plain: true }, asks.lookup)(`http://${name}:8080/x`), 'private')
    }
    await refused(fetchWith({ mode: 'development' }, asks.lookup)('https://db.internal/'), 'private')
    assert.deepEqual(asks.asked, [], JSON.stringify(name))
  }
})

test('[05-7.1] a name of this computer or of a private network with two dots at its end is refused before any look-up', async (t) => {
  const inner = await standIn(t, (_request, response) => response.end('what lies inside'))
  const looked: string[] = []
  for (const name of [
    'localhost..',
    'app.localhost..',
    'printer.local..',
    'db.internal..',
    'db.internal%2e%2e',
    'db.internal。。',
  ]) {
    // A resolver that answers every name, as the resolver of a network answers the names of its own machines.
    const asks = names({})
    const lookup = (asked: string): Promise<string[]> => {
      asks.asked.push(asked)
      return Promise.resolve(['127.0.0.1'])
    }
    for (const mode of ['test', 'live'] as const) {
      const error = await failure(fetchWith({ mode }, lookup)(`https://${name}:${inner.port}/`))
      assert.ok(error instanceof TentError && error.code === 'T0022', `${name}: ${error.message}`)
    }
    if (!name.includes('%') && !name.includes('。')) {
      const error = await failure(addressWith(name, { mode: 'live' }, lookup))
      assert.ok(error instanceof TentError && error.code === 'T0022', `${name}: ${error.message}`)
    }
    // A name of a private network is refused in development too: there the look-up is followed to the server.
    if (!name.includes('localhost'))
      await fetchWith(
        { mode: 'development' },
        lookup,
      )(`http://${name}:${inner.port}/secret`).then(
        (answer) => answer.text(),
        () => undefined,
      )
    if (asks.asked.length > 0) looked.push(`${name} was looked up as ${[...new Set(asks.asked)].join(', ')}`)
  }
  assert.deepEqual(
    inner.asked.map((one) => `${one.headers.host}${one.path}`),
    [],
    'the server behind a name of a private network was asked',
  )
  assert.deepEqual(looked, [])
})

test('[05-7.3] a redirect to another origin carries no sign-in of the first, by any status, and none comes back with it', async (t) => {
  const other = await standIn(t, (_request, response, asked) => {
    const back = new URL(asked.path, 'http://other.test').searchParams.get('back')
    if (back === null) response.end('the other host')
    else response.writeHead(302, { location: back }).end()
  })
  const first = await standIn(t, (_request, response, asked) => {
    const url = new URL(asked.path, 'http://first.test')
    const to = url.searchParams.get('to')
    if (to === null) response.end('the first host')
    else response.writeHead(Number(url.searchParams.get('by')), { location: to }).end()
  })
  const none = names({})
  const o = {
    mode: 'live' as const,
    privateHosts: [`http://127.0.0.1:${first.port}`, `http://127.0.0.1:${other.port}`],
  }
  const secrets = {
    authorization: 'Bearer the-sign-in',
    cookie: 'session=the-sign-in',
    'proxy-authorization': 'Basic the-sign-in',
    'x-api-key': 'the-sign-in',
    'x-amz-security-token': 'the-sign-in',
    'x-anything-at-all': 'the-sign-in',
  }
  const headers = { ...secrets, accept: 'text/plain', 'accept-language': 'en', 'user-agent': 'the test' }
  for (const fetch of [fetchWith(o, none.lookup), fetchWith({ ...o, plain: true }, none.lookup)])
    for (const by of [301, 302, 303, 307, 308])
      for (const method of ['GET', 'POST', 'PUT', 'DELETE'])
        for (const to of [
          `${other.origin}/landed`,
          `${other.origin}/?back=${encodeURIComponent(`${first.origin}/`)}`,
        ]) {
          first.asked.length = 0
          other.asked.length = 0
          const body = method === 'GET' ? {} : { body: 'what is sent' }
          const address = `${first.origin}/?by=${by}&to=${encodeURIComponent(to)}`
          const what = `${by} ${method} ${to}`
          // A redirect that keeps the body of a request would send it on to the other host, and is refused there.
          const keeps = method !== 'GET' && by !== 303 && !(method === 'POST' && (by === 301 || by === 302))
          if (keeps) {
            await refused(fetch(address, { method, headers, ...body }), 'body')
            assert.deepEqual(other.asked, [], what)
            continue
          }
          const answer = await fetch(address, { method, headers, ...body })
          await answer.text()
          // The first host is handed the sign-in, as it was written for it.
          assert.equal(first.asked[0]?.headers.authorization, 'Bearer the-sign-in', what)
          // Nothing after the first request carries it: not the other host, and not the first when it is come back to.
          for (const asked of [...other.asked, ...first.asked.slice(1)])
            assert.deepEqual(
              Object.entries(asked.headers).filter(([name, value]) => name in secrets || value.includes('sign-in')),
              [],
              what,
            )
          assert.equal(other.asked.length, 1, what)
          assert.equal(other.asked[0]?.headers.accept, 'text/plain', what)
        }
})
