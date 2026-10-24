import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { mcpApp, mcpProject, opened } from './mcpApp.ts'
import { remoteOf } from './remotes.ts'
import { alive, served } from './served.ts'
import { sessionIn } from './sessionIn.ts'
import { authorizeAt, chatApp, decideFormOf, proof, sessionBrowser, signedWith } from './signedFor.ts'

const redirect = 'https://chat.example/callback'

// A screen of the builder's own in place of the engine's page, with its two presses.
const allowScreen = `import { screen, Form } from 'tentjs/ui'

export const allowApp = screen('allowApp', {
  for: 'grant',
  access: 'signedIn',
  view: ({ grant }) => (
    <div>
      <h1>{grant.name} asks for {grant.scopes.join(' and ')}</h1>
      <span>{grant.named ? 'It named itself' : grant.host}</span>
      <Form call={grant.allow}><button type="submit"><span>Let it in</span></button></Form>
      <Form call={grant.refuse}><button type="submit"><span>Keep it out</span></button></Form>
    </div>
  ),
})
`

test("[25-6] [34-3.10] the project's own screen `for: 'grant'` is drawn in place of the engine's page, and a good token of the inspect mode frames neither", async (t) => {
  const plain = await mcpApp(t, [], 'mcpSigned')
  const folder = mcpProject(t, [], 'mcpSigned')
  writeFileSync(join(folder, 'allow.tsx'), allowScreen)
  const own = await opened(t, folder)
  for (const [app, drawn] of [
    [plain, /wants to act for you in Shop/],
    [own, /"screen":"allowApp"/],
  ] as const) {
    const ada = await app.user({ email: 'ada@example.com' })
    const chat = await chatApp(t, { name: 'Chat' })
    const token = app.inspect({ framedBy: 'https://studio.example' })
    const asking = `${authorizeAt({ client: chat.id, redirect, proof: proof() })}&t-inspect=${token}`
    const page = await app.browser({ as: ada }).request('GET', asking)
    assert.equal(page.status, 200)
    assert.match(await page.text(), drawn)
    const policy = String(page.headers.get('content-security-policy'))
    assert.match(policy, /frame-ancestors 'none'/, 'not framed, whatever the token says')
    assert.doesNotMatch(policy, /studio\.example/)
  }
})

test("[25-6] the two presses of the project's own `grant` screen allow and refuse by a POST, in a real browser", async (t) => {
  const callback = await remoteOf(t, (_heard, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('back at the chat app')
  })
  const at = await served('mcpSigned', {
    change: (folder) => writeFileSync(join(folder, 'allow.tsx'), allowScreen),
  })
  const ada = await at.app.call('signIn', { email: 'nobody' }, { as: { kind: 'system' } })
  assert.equal(ada, undefined)
  const person = await at.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: [] } }], {
    as: 'system',
  })
  const id = String(Object(Array.isArray(person) ? person[0] : person).id)
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const chat = await chatApp(t, { name: 'Chat', redirects: [`${callback.origin}/callback`] })
      await sessionIn(page, at.address, at.app.session(id))
      for (const [press, mark] of [
        ['Keep it out', 'error=access_denied'],
        ['Let it in', 'code='],
      ] as const) {
        const before = callback.heard.length
        await alive(
          page,
          `${at.address}${authorizeAt({ client: chat.id, redirect: `${callback.origin}/callback`, proof: proof() })}`,
        )
        await page.getByRole('heading', { name: 'Chat asks for read' }).waitFor()
        await page.getByRole('button', { name: press }).click()
        await page.getByText('back at the chat app').waitFor()
        const [heard] = callback.heard.slice(before)
        assert.ok(heard.path.includes(mark), `${engine}: ${heard.path}`)
      }
    })
})

test("[20-7@9b] [16-4@9b] [05-13.15] a person's removal ends their grants, the export of a person lists them, and `_t_oauth` keeps the fingerprints of the tokens alone", async (t) => {
  const at = await served('mcpSigned')
  const made = await at.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: [] } }], { as: 'system' })
  const ada = String(Object(Array.isArray(made) ? made[0] : made).id)
  const chat = await chatApp(t, { name: 'Chat' })
  // The app is reached by the name it was opened under.
  const via = {
    request: (request: Request, o?: { from?: string }) =>
      at.app.request(new Request(request.url.replace('http://localhost', at.address), request), o),
  }
  const browser = sessionBrowser(at.app, ada, at.address)
  const signed = await signedWith(via, browser, { client: chat.id, redirect, scope: 'read write' })
  const data = new DatabaseSync(join(at.dataFolder, 'data.db'), { readOnly: true })
  const rows = data.prepare('SELECT * FROM _t_oauth').all()
  data.close()
  assert.equal(rows.length, 1)
  const [row] = rows
  assert.deepEqual(
    [row.user, row.client, row.name, row.for, row.resource],
    [ada, chat.id, 'Chat', 'mcp', `${at.address}/mcp`],
  )
  const whole = JSON.stringify(row)
  // The random part of a token is all after the underscore that ends its id: it is written for an address, so it
  // may hold an underscore of its own.
  const randomOf = (token: string): string => token.slice(token.indexOf('_', 'tent_'.length) + 1)
  for (const token of [signed.access, signed.refresh]) {
    assert.equal(randomOf(token).length, 43)
    assert.ok(!whole.includes(randomOf(token)))
  }
  assert.ok(signed.access.startsWith(`tent_${row.id}_`), 'a token names its grant by its id')
  const { token } = JSON.parse(readFileSync(join(at.dataFolder, 'engine.json'), 'utf8'))
  const admin = async (args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const answer = await at.app.request(
      new Request(`${at.address}/_t/admin/data`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ args: { what: 'user', ...args } }),
      }),
    )
    return Object(Object(await answer.json()).value)
  }
  const listed = async (): Promise<number> =>
    (
      await at.app.request(
        new Request(`${at.address}/mcp`, {
          method: 'POST',
          headers: { authorization: `Bearer ${signed.access}`, 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: {} }),
        }),
      )
    ).status
  const exported = await admin({ do: 'export', id: ada })
  assert.deepEqual(
    (Array.isArray(exported.grants) ? exported.grants : []).map((one: unknown) => Object(one).client),
    [chat.id],
  )
  assert.equal(await listed(), 200)
  await admin({ do: 'remove', id: ada, yes: true })
  assert.equal(await listed(), 401)
})

test('[25-6] the asking page and its text name what is asked: a finer scope by its words', async (t) => {
  const app = await mcpApp(t, [], 'mcpSigned')
  const ada = await app.user({ email: 'ada@example.com' })
  const chat = await chatApp(t, { name: 'Chat' })
  const page = await app
    .browser({ as: ada })
    .request('GET', authorizeAt({ client: chat.id, redirect, proof: proof(), scope: 'billing nonsense' }))
  const html = await page.text()
  assert.match(html, /tent\.grant\.scope\.billing|billing/)
  assert.doesNotMatch(html, /nonsense/, 'a word that is no scope is left out')
  assert.ok(decideFormOf(html).text)
})
