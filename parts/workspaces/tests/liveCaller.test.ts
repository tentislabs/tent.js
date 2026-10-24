import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { asked, folderOf, held, identify, nameOf, ownerOf, product } from './held.ts'

// A screen of the workspace for signed-in people alone, which shows the email of its caller.
const mine = [
  "import { read, screen } from 'tentjs/ui'",
  "import { whoAmI } from '../functions/users'",
  '',
  "export const meScreen = screen('meScreen', {",
  "  path: '/me',",
  "  access: 'signedIn',",
  '  data: { me: read(whoAmI) },',
  '  view: ({ me }) => <p>{me?.email}</p>,',
  '})',
  '',
].join('\n')

test('[40-19] a workspace published into the product own engine knows its callers by the identify of the product, as its test side does', async (t) => {
  const at = await product(t, folderOf(t))
  const live = (id: string) => ({
    dataFolder: join(at.folder, 'live', id),
    address: `http://${id}.live.test:${at.port}`,
  })
  const made = await held(t, { identify, live }, at)
  const one = await made.workspaces.create({ owner: await ownerOf(made, 'ada@example.com'), from: 'blank' })
  writeFileSync(join(one.folder, 'project', 'screens', 'me.tsx'), mine)
  await made.workspaces.publish(one.id)
  const ada = { 'x-test-user': 'ada@example.com' }
  const side = await asked(at.port, `${one.id}.ws.test`, '/me', { headers: ada })
  assert.equal(side.status, 200)
  const shown = await asked(at.port, `${one.id}.live.test`, '/me', { headers: ada })
  assert.equal(shown.status, 200, shown.body.slice(0, 400))
  assert.match(shown.body, /ada@example\.com/)
  // A request that names nobody is nobody there too, and is sent on to sign in.
  const none = await asked(at.port, `${one.id}.live.test`, '/me')
  assert.equal(none.status, 302)
  assert.doesNotMatch(none.body, /ada@example\.com/)
})

test('[40-18a] the live connection of a page of a workspace knows its caller by the identify of the product, as its requests do', async (t) => {
  const at = await held(t, { identify })
  const one = await at.workspaces.create({ owner: await ownerOf(at, 'ada@example.com'), from: 'blank' })
  const app = await at.workspaces.run(one.id)
  const origin = `http://${nameOf(one.id)}:${at.port}`
  const ada = { origin, 'x-test-user': 'ada@example.com' }
  const named = await app.caller(new Request(`${origin}/`, { headers: ada }))
  const id = String(named.user?.id)
  const heard: Record<string, unknown>[] = []
  const live = app.live(new Request(`${origin}/_t/live?as=${id}`, { headers: ada }))
  live.each(
    (message) => void heard.push(message),
    () => undefined,
  )
  live.send({ t: 'watch', id: 'w1', query: 'whoAmI', input: {} })
  for (let i = 0; i < 2000 && !heard.some((message) => message.id === 'w1'); i++)
    await new Promise((done) => setTimeout(done, 5))
  const [answer] = heard.filter((message) => message.id === 'w1')
  assert.equal(answer?.t, 'result', JSON.stringify(heard))
  assert.equal(Object(answer?.value).email, 'ada@example.com')
})
