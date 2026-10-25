import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from 'tentjs/test'

type App = Awaited<ReturnType<typeof testApp>>

async function userId(app: App, email: string): Promise<string> {
  const user = (await app.rows('users')).find((row) => row.email === email)
  assert.ok(user, `the seed holds ${email}`)
  return String(user.id)
}

test('the seed holds the two people who build', async () => {
  const app = await testApp()
  try {
    assert.deepEqual((await app.rows('users')).map((row) => row.email).sort(), [
      'ada@builder.example',
      'bo@builder.example',
    ])
  } finally {
    await app.close()
  }
})

test('a person reads their own projects and conversations, and none of another', async () => {
  const app = await testApp()
  try {
    const ada = await userId(app, 'ada@builder.example')
    const bo = await userId(app, 'bo@builder.example')
    const mine = await app
      .as(ada)
      .call('recordProject', { workspace: 'w1', name: 'Tasks', address: 'http://w1.example' })
    await app.as(bo).call('recordProject', { workspace: 'w2', name: 'Books', address: 'http://w2.example' })
    const adas = await app.as(ada).call('myProjects', {})
    assert.deepEqual(
      adas.map((row) => row.name),
      ['Tasks'],
    )
    assert.equal(adas[0]?.owner.email, 'ada@builder.example')
    assert.deepEqual(
      (await app.as(bo).call('myProjects', {})).map((row) => row.name),
      ['Books'],
    )
    assert.deepEqual(await app.as(bo).call('projectMessages', { project: mine.id }), [])
  } finally {
    await app.close()
  }
})

test('a person cannot set the address of another person`s project', async () => {
  const app = await testApp()
  try {
    const ada = await userId(app, 'ada@builder.example')
    const bo = await userId(app, 'bo@builder.example')
    const mine = await app
      .as(ada)
      .call('recordProject', { workspace: 'w1', name: 'Tasks', address: 'http://w1.example' })
    await assert.rejects(app.as(bo).call('recordLive', { project: mine.id, live: 'http://evil.example' }))
    await app.as(ada).call('recordLive', { project: mine.id, live: 'http://w1.live.example' })
    assert.equal((await app.as(ada).call('myProjects', {}))[0]?.live, 'http://w1.live.example')
  } finally {
    await app.close()
  }
})

test('the frame of a project names its workspace and its person to the owner alone', async () => {
  const app = await testApp()
  try {
    const ada = await userId(app, 'ada@builder.example')
    const bo = await userId(app, 'bo@builder.example')
    const mine = await app
      .as(ada)
      .call('recordProject', { workspace: 'w1', name: 'Tasks', address: 'http://w1.example' })
    const asked = await app.browser({ as: ada }).request('GET', `/frame/${mine.id}`)
    assert.equal(asked.status, 200)
    assert.deepEqual(await asked.json(), { project: mine.id, workspace: 'w1', email: 'ada@builder.example' })
    assert.equal((await app.browser({ as: bo }).request('GET', `/frame/${mine.id}`)).status, 404)
    assert.notEqual((await app.browser().request('GET', `/frame/${mine.id}`)).status, 200)
  } finally {
    await app.close()
  }
})

test('nobody who is not signed in reaches the projects', async () => {
  const app = await testApp()
  try {
    await assert.rejects(app.as('nobody').call('myProjects', {}), { code: 'T0006' })
    assert.equal((await app.as('nobody').page('/')).status !== 200, true)
  } finally {
    await app.close()
  }
})
