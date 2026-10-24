import assert from 'node:assert/strict'
import test from 'node:test'
import { running } from './apps.ts'
import { scripted } from './followedApp.ts'
import { addBoardUser, cookieOf } from './watching.ts'

test('[22-12@9a] an upload whose for names an agent is held to the files of its start, as one that names a function: files and audio are taken, any other field is T0002', async (t) => {
  const model = scripted()
  const { app, origin } = await running(t, {
    project: 'told',
    engine: { makers: { providers: () => ({ mine: model.mine }) } },
  })
  const cookie = cookieOf(app, await addBoardUser(app, 'Maya'))
  const upload = (query: string) =>
    app.request(
      new Request(`${origin}/_t/files?name=a.txt${query}`, {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'text/plain', 'content-length': '5' },
        body: 'hello',
      }),
    )
  for (const field of ['files', 'audio']) {
    const sent = await upload(`&for=helper&field=${field}`)
    assert.equal(sent.status, 200, `${field}: ${await sent.clone().text()}`)
  }
  for (const query of ['&for=helper&field=message', '&for=helper.working&field=files']) {
    const refused = await upload(query)
    assert.equal(refused.status, 400, query)
    assert.equal(Object(Object(await refused.json()).error).code, 'T0002', query)
  }
})
