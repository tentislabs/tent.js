import assert from 'node:assert/strict'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { writeKey } from '../../engine/index.ts'
import { remoteOf } from './remotes.ts'
import { served } from './served.ts'
import { sessionIn } from './sessionIn.ts'
import { authorizeAt, chatApp, proof } from './signedFor.ts'

/** A person of a served app, by the id of its row. */
async function personOf(app: Awaited<ReturnType<typeof served>>['app']): Promise<string> {
  const made = await app.write([{ add: 'users', values: { email: 'ada@example.com', roles: [] } }], { as: 'system' })
  return String(Object(Array.isArray(made) ? made[0] : made).id)
}

test("[25-6] the engine's own page where a person lets a program in sends its form from the app's own origin: Allow and Refuse work in a real browser", async (t) => {
  const callback = await remoteOf(t, (_heard, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('back at the chat app')
  })
  const at = await served('mcpSigned')
  const id = await personOf(at.app)
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const chat = await chatApp(t, { name: 'Chat', redirects: [`${callback.origin}/callback`] })
      await sessionIn(page, at.address, at.app.session(id))
      for (const [press, mark] of [
        ['Refuse', 'error=access_denied'],
        ['Allow', 'code='],
      ] as const) {
        const before = callback.heard.length
        await page.goto(
          `${at.address}${authorizeAt({ client: chat.id, redirect: `${callback.origin}/callback`, proof: proof() })}`,
        )
        await page.getByRole('button', { name: press }).click()
        await page.getByText('back at the chat app').waitFor()
        const [heard] = callback.heard.slice(before)
        assert.ok(heard?.path.includes(mark), `${engine}: ${heard?.path}`)
      }
    })
})

test("[25-5] the engine's own page of an ask sends its yes from the app's own origin, in a real browser", async () => {
  const at = await served('mcped')
  const id = await personOf(at.app)
  const { key } = writeKey(at.app, { user: id, scopes: ['*'] })
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      // A client of the newest form that cannot ask is answered T7120 with the address of the page.
      const answer = await fetch(`${at.address}/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'removeOrder',
            // A call of its own in each browser: a yes is for one call, by its input.
            arguments: { order: `o-${engine}` },
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      })
      const result = Object(Object(await answer.json()).result)
      const address = String(Object(Object(Object(result._meta)['tent.error']).fields).page)
      assert.match(address, /\/_t\/ask\?a=/, JSON.stringify(result))
      await sessionIn(page, at.address, at.app.session(id))
      await page.goto(address)
      await page.getByRole('button', { name: 'Yes' }).click()
      await page.getByText('This was answered.').waitFor()
    })
})
